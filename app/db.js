const fs = require('fs');
const DB_FILE = 'db.json'

let data = {
    threadIdToChatId: {},
    chatIdToThreadId: {},
    defaultThreadId: null,
    defaultChatId: null,
};

const saveDb = () => fs.writeFileSync(DB_FILE, JSON.stringify(data));

if (!fs.existsSync(DB_FILE)) {
    saveDb();
} else {
    data = JSON.parse(fs.readFileSync(DB_FILE));
}

const updateDb = (newData) => {
    data = Object.assign({}, data, newData);
    console.log('db update: ', data);
    saveDb();
    return data;
}

const getDb = () => data;

module.exports = {
    getDb,
    updateDb,
}