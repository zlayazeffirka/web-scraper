const fs = require('fs');
const request = require('request-promise');
const yaml = require('js-yaml');
const cheerio = require('cheerio'); // для работы с DOM

// Задержка между запросами в миллисекундах
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Функция для очистки текста от специальных символов
function cleanText(text) {
  return text.replace(/[^\w\sа-яА-ЯёЁ]/g, '').trim();
}

// Функция для извлечения структурированных данных из текста для разных источников
function parseContent(source, texts) {
  const structuredData = [];

  switch (source) {
    case 'judo_ru_event':
    case 'judoka24_event':
      // Формат: [фамилия, имя, регион, фамилия, имя, регион, ...]
      for (let i = 0; i < texts.length; i += 2) {
        structuredData.push({
          name: cleanText(texts[i]),   // Фамилия и имя
          region: cleanText(texts[i + 1] || '') // Регион (проверка на undefined)
        });
      }
      break;

    case 'paralymp_news':
      // Формат: каждый элемент - фамилия и имя
      texts.forEach(text => {
        structuredData.push({
          name: cleanText(text) // Фамилия и имя
        });
      });
      break;

    case 'mossambo_games':
      // Формат: каждый элемент - название мероприятия
      texts.forEach(text => {
        structuredData.push({
          eventName: cleanText(text) // Название мероприятия
        });
      });
      break;

    case 'cfo_judo_games':
      // Формат: каждая строка делится по символу '\n' на 4 части: дата, название, место, категории участников
      texts.forEach(text => {
        const parts = text.split('\n').map(part => cleanText(part)); // Разделяем по '\n' и очищаем
        if (parts.length >= 6) { // Убедимся, что есть все 4 части
          structuredData.push({
            date_start: parts[2],
            date_finish: parts[3],           // Дата проведения
            eventName: parts[4],      // Название мероприятия
            location: parts[5],       // Место проведения
            categories: parts[6]      // Категории участников
          });
        }
      });
      break;

    default:
      // Если структура неизвестна, сохраняем в "сырую" структуру
      structuredData.push({ rawContent: texts.join(' ') });
  }

  return structuredData;
}

// Функция для сохранения данных в файл
function saveData(source, data) {
  const path = `./data/${source}.yaml`;
  const oldData = fs.existsSync(path) ? yaml.load(fs.readFileSync(path, 'utf8')) : [];

  // Добавляем новую запись в массив
  oldData.push(data);

  // Сохраняем данные, сериализуя их в YAML
  fs.writeFileSync(path, yaml.dump(oldData), 'utf8');
}

// Функция для выполнения запросов к источникам с парсингом по селекторам
async function fetchData(url, source, selector) {
  try {
    const response = await request(url);
    const $ = cheerio.load(response); // загружаем HTML на страницу с помощью cheerio

    // Извлекаем текст по переданному селектору
    const texts = Array.from($(selector)).map(element => $(element).text());

    // Разделение текста на структурированные элементы в зависимости от источника
    const structuredContent = parseContent(source, texts);

    const data = { url, content: structuredContent, timestamp: new Date() };
    console.log(`Данные получены и распарсены с ${url}`);

    // Сохраняем данные по мере поступления
    saveData(source, data);
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

  // Создаем папку для сохранения данных, если ее нет
  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
  }

  // Перебор всех источников с задержкой
  for (const { url, source, selector } of sources) {
    await fetchData(url, source, selector);
    await delay(3000); // задержка в 3 секунды между запросами
  }
}

// Запуск скрипта
scrape();
