const fs = require('fs');
const yaml = require('js-yaml');

// Функция для анализа количества слов в тексте или массиве строк
function wordCount(textArrayOrString) {
  let text;

  // Проверяем, является ли textArrayOrString массивом
  if (Array.isArray(textArrayOrString)) {
    // Объединяем все строки из массива в один текст
    text = textArrayOrString.join(' ');
  } else {
    // Если это не массив, то считаем, что это строка
    text = textArrayOrString;
  }

  // Разбиваем текст на слова и считаем их количество
  return text ? text.split(/\s+/).length : 0;
}

// Функция для анализа данных из файла
function analyzeDataset(source) {
  const path = `./data/${source}.yaml`;

  if (!fs.existsSync(path)) {
    console.log(`Данные для источника ${source} не найдены.`);
    return;
  }

  const data = yaml.load(fs.readFileSync(path, 'utf8'));
  
  const recordCount = data.length;
  const wordCounts = data.map(entry => wordCount(entry.content));
  
  // Обрабатываем все слова из всех записей как один набор уникальных слов
  const uniqueWords = new Set(
    data.flatMap(entry => 
      Array.isArray(entry.content) 
        ? entry.content.join(' ').split(/\s+/)  // если content - массив
        : entry.content.split(/\s+/)            // если content - строка
    )
  );

  const minWords = Math.min(...wordCounts);
  const maxWords = Math.max(...wordCounts);
  const avgWords = wordCounts.reduce((acc, count) => acc + count, 0) / wordCounts.length;
  const medianWords = wordCounts.sort((a, b) => a - b)[Math.floor(wordCounts.length / 2)];

  const dates = data.map(entry => new Date(entry.timestamp));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));

  console.log(`Анализ источника: ${source}`);
  console.log(`Количество записей: ${recordCount}`);
  console.log(`Количество уникальных слов: ${uniqueWords.size}`);
  console.log(`Минимальное количество слов в записи: ${minWords}`);
  console.log(`Максимальное количество слов в записи: ${maxWords}`);
  console.log(`Среднее количество слов в записи: ${avgWords.toFixed(2)}`);
  console.log(`Медианное количество слов в записи: ${medianWords}`);
  console.log(`Диапазон дат публикации: с ${minDate.toISOString()} по ${maxDate.toISOString()}`);
}

// Анализ всех источников
function analyzeAll() {
  const sources = ['judo_ru_event', 'paralymp_news', 'judoka24_event', 'mossambo_games', 'cfo_judo_games'];

  sources.forEach(source => analyzeDataset(source));
}

// Запуск анализа
analyzeAll();
