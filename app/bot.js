var fs = require('fs');
var btn = require('./utils');
const { getDb, updateDb } = require('./db');
const login = require('facebook-chat-api');
var TelegramBot = require('node-telegram-bot-api');
var token = process.env.TELEGRAM_TOKEN;
var bot = new TelegramBot(token, {
    polling: true
});

let credentials = {
    email: process.env.FB_EMAIL,
    password: process.env.FB_PASSWORD,
};

if (fs.existsSync('appstate.json')) {
    credentials = {
        appState: JSON.parse(fs.readFileSync('appstate.json', 'utf8'))
    }
}

const getDefaultChatId = () => getDb().defaultChatId;

const getChatId = (message) => {
    const db = getDb();
    const defaultChatId = getDefaultChatId();
    if (db.threadIdToChatId[message.threadID]) {
        return db.threadIdToChatId[message.threadID];
    }
    return defaultChatId;
}

const getThreadId = (chatId) => {
    const db = getDb();
    if (chatId === getDefaultChatId()) {
        return db.defaultThreadId;
    } else {
        return db.chatIdToThreadId[chatId];
    }
}

const handleBotCommand = (msg, chatId) => {
    const [command, ...args] = msg.text.split(' ');
    if (command === '/help') {
        bot.sendMessage(chatId,
`This bot will allow you to send/receive message from messenger to telegram

List of availables command:
/help print this help
/st [THREAD_ID] set the conversation on a particular thread id.

A thread id represent a messenger conversation (private or group). If a telegram conversation have an assignoed thread id, every message received from this person/group will arrive in this conversation and messages will directly be delivered to the messenger conversation. You can click on 'respond to' in your default inbox to view the thread id
`);
    } else if (command === '/st') {
        const [threadId] = args;
        if (!threadId) {
            bot.sendMessage(chatId, 'Error: you should specify a thread id');
            return;
        }
        if (chatId === getDefaultChatId()) {
            bot.sendMessage(chatId, 'Error: you can not set your default inbox on a specific thread');
            return;
        }
        const db = getDb();
        updateDb({
            threadIdToChatId: {...db.threadIdToChatId, [threadId]: chatId},
            chatIdToThreadId: {...db.chatIdToThreadId, [chatId]: threadId}
        });
        bot.sendMessage(chatId, 'Successfully set thread id');
    } else {
        bot.sendMessage(chatId, `Unkown command '${command}', use /help if you want more informations`);
    }

}

login(credentials, function callback(err, api) {
    if (err) return console.error(err);
    // Save Session
    console.log('Save session to appstate.json');
    fs.writeFileSync('appstate.json', JSON.stringify(api.getAppState()));

    api.listenMqtt(function callback(err, message) {
        if (err) return console.error(err);
        if (message.type !== 'message') {
            return;
        }
        var name = "";
        var groupName = "";
        api.getThreadInfo(message.threadID, function (err_1, ret_1){
            if (err_1) return console.error(err_1);
            if (ret_1.name) groupName = ret_1.name;

            api.getUserInfo([message.senderID], function (err, ret) {
                if (err) return console.error(err);
                for (var prop in ret) {
                    if (ret.hasOwnProperty(prop) && ret[prop].name) {
                        name = ret[prop].name
                    }
                }
                const chatId = getChatId(message);
                if (!chatId) {
                    console.error('No chatId found, ignoring message');
                    return;
                }
                const isCustomChat = chatId !== getDefaultChatId();
                switch (message.type) {
                    case "message":
                        if (message.attachments.length > 0) {
                            var i = 0;
                            for (i = 0; i < message.attachments.length; i++){
                                console.log(message.attachments[i].type);
                                console.log(message.attachments[i]);
                                switch(message.attachments[i].type) {
                                    case 'photo':
                                        bot.sendPhoto(chatId, message.attachments[i].url, {caption: "Sent by: " + name });
                                        break;
                                    case 'video':
                                        bot.sendVideo(chatId, message.attachments[i].url, {caption: "Sent by: " + name });
                                        break;
                                    case 'audio':
                                        bot.sendAudio(chatId, message.attachments[i].url, {caption: "Sent by: " + name });
                                        break;
                                    case 'animated_image':
                                        bot.sendDocument(chatId, message.attachments[i].url, {caption: "Sent by: " + name });
                                        break;
                                    case 'sticker':
                                        bot.sendPhoto(chatId, message.attachments[i].url, {caption: "Sent by: " + name });
                                        break;
                                    default:
                                        bot.sendMessage(chatId, "Something went wrong :S");
                                }
                            }
                        } else {
                            let toSent = "";
                            if (groupName === "") {
                                if (isCustomChat) {
                                    toSent = message.body;
                                } else {
                                    toSent = ' (' + name +'): ' + message.body;
                                }
                            } else {
                                if (isCustomChat) {
                                    toSent = ' (' + name +'): ' + message.body
                                } else {
                                    toSent = groupName.substring(0, 30) + ' (' + name +'): ' + message.body
                                }
                            }
                            if(isCustomChat) {
                                bot.sendMessage(chatId, toSent);
                            } else {
                                bot.sendMessage(chatId, toSent, btn.inlineReply('✏️ Respond to ' + name, message.threadID));
                            }

                        }
                        break;
                    case 'read_receipt':
                        // bot.sendMessage(chatId, name + ' (Messenger): ✅ Seen ✅');
                        break;
                    default:
                        bot.sendMessage(chatId, ' ERROR: This type does not exist' + message.type);
                }
            });
        });
    });


    bot.on('callback_query', function(msg) {
        console.log(msg);
        const chatId = msg.message.chat.id;
        if (chatId !== getDefaultChatId()) {
            bot.sendMessage('This should not append');
            return;
        }
        var data = msg.data;
        updateDb({
            defaultThreadId: data,
        });
        bot.sendMessage(chatId, "Changed group/user, thread id in next message");
        bot.sendMessage(chatId, data);
    });

    bot.on('message', function (msg) {
        console.log(msg);
        const chatId = msg.chat.id;
        const db = getDb();
        if (!db.defaultThreadId) {
            updateDb({
                defaultChatId: chatId,
            });
            bot.sendMessage(chatId, 'This has been set as your default chat, all unbind message will arrive here');
        }

        if (msg.from.is_bot) {
            console.log('Ignoring bot messages');
            return;
        }

        if (!msg.text) {
            return bot.sendMessage(chatId, 'No message sent');
        }

        if (msg.text.startsWith('/')) {
            return handleBotCommand(msg, chatId)
        }

        const threadId = getThreadId(chatId)
        if (threadId) {
            api.sendMessage(msg.text, threadId);
        } else {
            bot.sendMessage(chatId, 'Failed to retrieve threadId');
        }
    });

    bot.on('photo', function(msg) {
        const threadId = getThreadId();
        if (threadId) {
            bot.downloadFile(msg.photo[msg.photo.length - 1].file_id, './images').then(function(path) {
                console.log(path);
                var msg = {
                    body: "",
                    attachment: fs.createReadStream(path)
                }
                api.sendMessage(msg, threadId);
            });
        } else {
            bot.sendMessage(chat, 'Failed to retrieve threadId');
        }

    });

});