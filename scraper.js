const fs = require('fs');
const request = require('request-promise');
const yaml = require('js-yaml');

// Задержка между запросами в миллисекундах
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Функция для сохранения данных в файл
function saveData(source, data) {
  const path = `./data/${source}.yaml`;
  const oldData = fs.existsSync(path) ? yaml.load(fs.readFileSync(path, 'utf8')) : [];
  oldData.push(data);
  fs.writeFileSync(path, yaml.dump(oldData));
}

// Функция для выполнения запросов к источникам
async function fetchData(url, source) {
  try {
    const response = await request(url);
    const data = { url, content: response, timestamp: new Date() };
    console.log(`Данные получены с ${url}`);
    
    // Сохраняем данные по мере поступления
    saveData(source, data);
  } catch (error) {
    console.error(`Ошибка при запросе к ${url}:`, error.message);
  }
}

// Основная функция для работы с несколькими источниками
async function scrape() {
  const sources = [
    { url: 'https://online.judo.ru/event/11978', source: 'judo_ru_event' },
    { url: 'https://paralymp.ru/press_center/news/dzyudo/17-05-2023-opredeleny_pobediteli_chempionata_rossii_po_dzyudo_sporta_slepykh/', source: 'paralymp_news' },
    { url: 'https://online.judoka24.ru/event/98', source: 'judoka24_event' },
    { url: 'https://mossambo.ru/games/all?category_id=all&year=2023', source: 'mossambo_games' },
    { url: 'https://cfo-judo.ru/games/', source: 'cfo_judo_games' }
  ];

  // Создаем папку для сохранения данных, если ее нет
  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
  }

  // Перебор всех источников с задержкой
  for (const { url, source } of sources) {
    await fetchData(url, source);
    await delay(3000); // задержка в 3 секунды между запросами
  }
}

// Запуск скрипта
scrape();
