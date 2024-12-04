const fs = require('fs');
const request = require('request-promise');
const cheerio = require('cheerio');
const { Sequelize, DataTypes } = require('sequelize');
const express = require('express');

// Создание Express приложения
const app = express();
const PORT = 3000;

// Устанавливаем EJS как шаблонизатор
app.set('view engine', 'ejs');

// Настройка подключения к базе данных PostgreSQL через Sequelize
const sequelize = new Sequelize('WEB_SCRAPER', 'postgres', 'postgres', {
  host: 'localhost',
  dialect: 'postgres'
});

// Задержка между запросами в миллисекундах
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Функция для очистки текста от специальных символов
function cleanText(text) {
  return text.replace(/[^\w\sа-яА-ЯёЁ]/g, '').trim();
}

// Функция для создания модели таблицы в зависимости от источника
function defineModel(source) {
  switch (source) {
    case 'judo_events':
    case 'judoka24_event':
      return sequelize.define(source, {
        name: { type: DataTypes.TEXT },
        region: { type: DataTypes.TEXT }
      });
      
    case 'paralymp_news':
      return sequelize.define(source, {
        name: { type: DataTypes.TEXT }
      });
      
    case 'mossambo_games':
      return sequelize.define(source, {
        eventName: { type: DataTypes.TEXT }
      });
      
    case 'cfo_judo_games':
      return sequelize.define(source, {
        date_start: { type: DataTypes.TEXT },
        date_finish: { type: DataTypes.TEXT },
        eventName: { type: DataTypes.TEXT },
        location: { type: DataTypes.TEXT },
        categories: { type: DataTypes.TEXT }
      });
      
    default:
      return sequelize.define(source, {
        rawContent: { type: DataTypes.TEXT }
      });
  }
}

// Функция для извлечения структурированных данных из текста для разных источников
function parseContent(source, texts) {
  const structuredData = [];

  switch (source) {
    case 'judo_events':
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
        structuredData.push({ name: cleanText(text) });
      });
      break;
    case 'mossambo_games':
      texts.forEach(text => {
        structuredData.push({ eventName: cleanText(text) });
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

    const Model = defineModel(source);
    await Model.sync();  // Создаем таблицу, если ее нет
    await Model.bulkCreate(structuredContent);  // Сохраняем данные
    console.log(`Данные для ${source} сохранены в базу данных`);
  } catch (error) {
    console.error(`Ошибка при обработке ${url}:`, error.message);
  }
}

// Основная функция для работы с несколькими источниками
async function scrape() {
  const sources = [
    { url: 'https://online.judo.ru/event/11978', source: 'judo_events', selector: '.text_cell200' },
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
  await sequelize.close();
}

// Маршрут для отображения данных из базы
app.get('/', async (req, res) => {
  try {
    const sources = ['judo_events', 'paralymp_news', 'judoka24_event', 'mossambo_games', 'cfo_judo_games'];
    const data = {};

    for (const source of sources) {
      const Model = defineModel(source);
      await Model.sync();
      data[source] = await Model.findAll(); // Получаем данные из каждой таблицы
    }

    res.render('index', { data }); // Рендерим страницу с данными
  } catch (error) {
    console.error('Ошибка при получении данных:', error.message);
    res.status(500).send('Ошибка сервера');
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});

// Запуск скрипта
(async () => {
  await scrape();
})();
