const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

async function run() {
    const logPath = `C:\\Users\\matheus.miguel\\.gemini\\antigravity\\brain\\cb655e89-b026-4e63-9103-b7ed38412cc9\\.system_generated\\logs\\transcript_full.jsonl`;
    const logs = fs.readFileSync(logPath, 'utf8').split('\n');
    let userMsg = '';
    for (let i = logs.length - 1; i >= 0; i--) {
        if (!logs[i]) continue;
        try {
            const entry = JSON.parse(logs[i]);
            if (entry.type === 'USER_INPUT' && entry.content.includes('INSERT INTO `msproduto`')) {
                userMsg = entry.content;
                break;
            }
        } catch(e) {}
    }

    if (!userMsg) {
        console.log('User message not found');
        return;
    }

    const inserts = userMsg.match(/INSERT INTO `msproduto`[\s\S]*?;/g);
    if (!inserts) {
        console.log('No inserts found');
        return;
    }

    const prisma = new PrismaClient();
    await prisma.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS=0;`);
    for (let i = 0; i < inserts.length; i++) {
        console.log(`Executing insert ${i+1}/${inserts.length}`);
        await prisma.$executeRawUnsafe(inserts[i]);
    }
    await prisma.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS=1;`);
    await prisma.$disconnect();
    console.log('Done!');
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
