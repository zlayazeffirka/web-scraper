const fs = require('fs');
const request = require('request-promise');
const yaml = require('js-yaml');
const cheerio = require('cheerio');
const { Client } = require('pg');
const cron = require('node-cron'); // Для cron-задач

// Задержка между запросами в миллисекундах
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Функция для очистки текста от специальных символов
function cleanText(text) {
  return text.replace(/[^\w\sа-яА-ЯёЁ]/g, '').trim();
}

// Подключение к базе данных PostgreSQL
const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'WEB_SCRAPER',
  password: 'postgres',
  port: 5432,
});

// Подключение к базе данных
client.connect();

// Функция для создания таблицы, если ее еще нет
async function createTable(source) {
  let createTableQuery = '';
  const createTaskStatusTable = `
    CREATE TABLE IF NOT EXISTS task_status (
      id SERIAL PRIMARY KEY,
      task_name TEXT,
      status TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await client.query(createTaskStatusTable);

  switch (source) {
    case 'judo_ru_event':
    case 'judoka24_event':
      createTableQuery = `
        CREATE TABLE IF NOT EXISTS ${source} (
          id SERIAL PRIMARY KEY,
          name TEXT,
          region TEXT
        );
      `;
      break;
    case 'paralymp_news':
      createTableQuery = `
        CREATE TABLE IF NOT EXISTS ${source} (
          id SERIAL PRIMARY KEY,
          name TEXT
        );
      `;
      break;
    case 'mossambo_games':
      createTableQuery = `
        CREATE TABLE IF NOT EXISTS ${source} (
          id SERIAL PRIMARY KEY,
          event_name TEXT
        );
      `;
      break;
    case 'cfo_judo_games':
      createTableQuery = `
        CREATE TABLE IF NOT EXISTS ${source} (
          id SERIAL PRIMARY KEY,
          date_start TEXT,
          date_finish TEXT,
          event_name TEXT,
          location TEXT,
          categories TEXT
        );
      `;
      break;
    default:
      createTableQuery = `
        CREATE TABLE IF NOT EXISTS ${source} (
          id SERIAL PRIMARY KEY,
          raw_content TEXT
        );
      `;
  }

  await client.query(createTableQuery);
}

// Функция для записи статуса задачи
async function recordTaskStatus(taskName, status) {
  const insertStatusQuery = `
    INSERT INTO task_status (task_name, status) VALUES ($1, $2);
  `;
  await client.query(insertStatusQuery, [taskName, status]);
  console.log(`Статус задачи ${taskName}: ${status}`);
}

// Функция для сохранения данных в базу данных PostgreSQL
async function saveDataToDB(source, data) {
  await createTable(source);

  const insertPromises = data.content.map(entry => {
    let insertQuery = '';
    const values = Object.values(entry);

    switch (source) {
      case 'judo_ru_event':
      case 'judoka24_event':
        insertQuery = `INSERT INTO ${source} (name, region) VALUES ($1, $2);`;
        break;
      case 'paralymp_news':
        insertQuery = `INSERT INTO ${source} (name) VALUES ($1);`;
        break;
      case 'mossambo_games':
        insertQuery = `INSERT INTO ${source} (event_name) VALUES ($1);`;
        break;
      case 'cfo_judo_games':
        insertQuery = `INSERT INTO ${source} (date_start, date_finish, event_name, location, categories) VALUES ($1, $2, $3, $4, $5);`;
        break;
      default:
        insertQuery = `INSERT INTO ${source} (raw_content) VALUES ($1);`;
    }

    return client.query(insertQuery, values);
  });

  await Promise.all(insertPromises);
  console.log(`Данные для ${source} сохранены в базу данных`);
}

// Функция для извлечения структурированных данных из текста для разных источников
function parseContent(source, texts) {
  const structuredData = [];

  switch (source) {
    case 'judo_ru_event':
    case 'judoka24_event':
      for (let i = 0; i < texts.length; i += 2) {
        structuredData.push({
          name: cleanText(texts[i]),
          region: cleanText(texts[i + 1] || '')
        });
      }
      break;
    case 'paralymp_news':
      texts.forEach(text => {
        structuredData.push({
          name: cleanText(text)
        });
      });
      break;
    case 'mossambo_games':
      texts.forEach(text => {
        structuredData.push({
          eventName: cleanText(text)
        });
      });
      break;
    case 'cfo_judo_games':
      texts.forEach(text => {
        const parts = text.split('\n').map(part => cleanText(part));
        if (parts.length >= 6) {
          structuredData.push({
            date_start: parts[2],
            date_finish: parts[3],
            eventName: parts[4],
            location: parts[5],
            categories: parts[6]
          });
        }
      });
      break;
    default:
      structuredData.push({ rawContent: texts.join(' ') });
  }

  return structuredData;
}

// Функция для выполнения запросов к источникам с парсингом по селекторам
async function fetchData(url, source, selector) {
  try {
    const response = await request(url);
    const $ = cheerio.load(response);

    const texts = Array.from($(selector)).map(element => $(element).text());

    const structuredContent = parseContent(source, texts);

    const data = { url, content: structuredContent, timestamp: new Date() };
    console.log(`Данные получены и распарсены с ${url}`);

    await saveDataToDB(source, data);
  } catch (error) {
    console.error(`Ошибка при запросе к ${url}:`, error.message);
  }
}

// Основная функция для работы с несколькими источниками
async function scrape() {
  const sources = [
    { url: 'https://online.judo.ru/event/11978', source: 'judo_ru_event', selector: '.text_cell200' },
    { url: 'https://paralymp.ru/press_center/news/dzyudo/17-05-2023-opredeleny_pobediteli_chempionata_rossii_po_dzyudo_sporta_slepykh/', source: 'paralymp_news', selector: '.tooltip' },
    { url: 'https://online.judoka24.ru/event/98', source: 'judoka24_event', selector: '.text_cell200' },
    { url: 'https://mossambo.ru/games/all?category_id=all&year=2023', source: 'mossambo_games', selector: '.title' },
    { url: 'https://cfo-judo.ru/games/', source: 'cfo_judo_games', selector: '.main_calendar_all' }
  ];

  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
  }

  for (const { url, source, selector } of sources) {
    await fetchData(url, source, selector);
    await delay(3000);
  }

  // Закрытие подключения к базе данных после завершения работы
  await client.end();
}

// Настройка cron-задачи для запуска скрипта каждый день в 00:00
cron.schedule('0 0 * * *', async () => {
  await recordTaskStatus('scrape_task', 'STARTED');
  await scrape();
  await recordTaskStatus('scrape_task', 'COMPLETED');
});
