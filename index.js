const { Telegraf } = require('telegraf');
const { Client } = require('@notionhq/client');

// Инициализация
const bot = new Telegraf(process.env.BOT_TOKEN);
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DATABASE_ID = '229d84b538f68031802bee660a681a2c';
const PRODUCT_NAME = 'CRM шаблон'; // Для этого бота только CRM

// Обработка заявок на вступление
bot.on('chat_join_request', async (ctx) => {
  const userId = ctx.chatJoinRequest.from.id;
  const username = ctx.chatJoinRequest.from.username || '';
  const firstName = ctx.chatJoinRequest.from.first_name || '';
  
  console.log(`📋 Заявка на вступление: ${firstName} (@${username}, ID: ${userId})`);
  
  try {
    // Ищем покупателя в базе Notion
    const hasAccess = await checkBuyerAccess(userId, username);
    
    if (hasAccess) {
      // ✅ ОДОБРЯЕМ
      await ctx.approveChatJoinRequest(userId);
      
      // Помечаем доступ как предоставленный
      await markAccessGranted(hasAccess.pageId);
      
      // Отправляем приветствие
      await sendWelcomeMessage(ctx, userId);
      
      console.log(`✅ Одобрен: ${firstName} (@${username})`);
      
    } else {
      // ❌ ОТКЛОНЯЕМ
      await ctx.declineChatJoinRequest(userId);
      
      // Отправляем объяснение
      await sendRejectionMessage(ctx, userId);
      
      console.log(`❌ Отклонен: ${firstName} (@${username})`);
    }
    
  } catch (error) {
    console.error('Ошибка обработки заявки:', error);
    
    // В случае ошибки отклоняем
    await ctx.declineChatJoinRequest(userId);
  }
});

// Функция проверки доступа
async function checkBuyerAccess(userId, username) {
  try {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        and: [
          {
            or: [
              { property: 'Telegram ID', number: { equals: userId } },
              { property: 'Username Telegram', rich_text: { contains: username } }
            ]
          },
          { property: 'Продукт', select: { equals: PRODUCT_NAME } },
          { property: 'Доступ предоставлен', checkbox: { equals: false } },
          { property: 'Статус', select: { equals: 'Активный' } }
        ]
      }
    });
    
    if (response.results.length > 0) {
      return {
        found: true,
        pageId: response.results[0].id,
        orderID: response.results[0].properties['Номер заказа'].title[0].text.content
      };
    }
    
    return false;
    
  } catch (error) {
    console.error('Ошибка проверки в Notion:', error);
    return false;
  }
}

// Помечаем доступ как предоставленный
async function markAccessGranted(pageId) {
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        'Доступ предоставлен': { checkbox: true }
      }
    });
  } catch (error) {
    console.error('Ошибка обновления записи:', error);
  }
}

// Приветственное сообщение
async function sendWelcomeMessage(ctx, userId) {
  try {
    await ctx.telegram.sendMessage(userId, `
🎉 Добро пожаловать в CRM группу!

📋 Здесь вы найдете:
- Ссылку на ваш шаблон
- Инструкции по использованию
- Обновления и улучшения
- Поддержку от автора

🔗 Актуальная ссылка на шаблон всегда в закрепленном сообщении группы.

❓ Вопросы: @your_support
    `);
  } catch (error) {
    console.error('Ошибка отправки приветствия:', error);
  }
}

// Сообщение об отклонении
async function sendRejectionMessage(ctx, userId) {
  try {
    await ctx.telegram.sendMessage(userId, `
❌ Доступ в CRM группу только для покупателей

Возможные причины отклонения:
- Вы не покупали CRM шаблон
- Неправильно указан Telegram при покупке
- Доступ уже был предоставлен ранее

💡 Если вы покупали продукт:
1. Напишите в поддержку: @your_support
2. Укажите ваш email при покупке

🛒 Хотите купить CRM шаблон?
Перейдите: [ссылка на Tribute]
    `);
  } catch (error) {
    console.error('Ошибка отправки отклонения:', error);
  }
}

// Запуск бота
bot.launch().then(() => {
  console.log('🤖 CRM Moderator Bot запущен!');
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
