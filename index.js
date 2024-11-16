const fs = require('fs');
const path = require('path');
const readline = require("readline");
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const chalk = require("chalk");
const { useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, makeInMemoryStore, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const log = console.log;
const { socket, smsg } = require("./files/socket");  // Importing socket and smsg from external file

class WhatsAppBot {
    constructor() {
        this.store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
        this.logger = pino({ level: 'silent', stream: 'store' });
    }

    async initialize() {
        const { state, saveCreds } = await useMultiFileAuthState(process.cwd() + "/sessions");
        const { version } = await fetchLatestBaileysVersion();
        const core = socket({ 
            version,
            logger: this.logger,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, this.logger)
            },
            mobile: false,
            printQRInTerminal: false,
            browser: Browsers.ubuntu("Chrome"),
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            retryRequestDelayMs: 10,
            transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 10 },
            maxMsgRetryCount: 15,
            appStateMacVerification: { patch: true, snapshot: true }
        });
        this.store.bind(core.ev); 
        await this.pairing(core);
        this.events(core, saveCreds);
        return core;
    }

    async pairing(core) {
        if (core.authState && !core.authState.creds.registered) {
            const phone = await this.getPhoneNumber();
            setTimeout(async () => {
                let code = await core.requestPairingCode(phone);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`Your Pairing Code: ${code}`);
            }, 3000);
        }
    }

    events(core, saveCreds) {
        if (core && core.ev) {
            core.ev.on('connection.update', async update => {
                const { connection, lastDisconnect } = update;
                if (connection === 'close') {
                    await this.handleDisconnection(new Boom(lastDisconnect?.error)?.output.statusCode);
                } else if (connection == "connecting") {
                } else if (connection === "open") {
                    console.log("connected")
                }
                });
            core.ev.on('creds.update', saveCreds);
            core.ev.on('messages.upsert', (messages) => {});
        }
    }

    async handleDisconnection(reason) {
        switch (reason) {
            case DisconnectReason.badSession:
                log(chalk.red(`Bad Session File, Please Delete Session and Scan Again`));
                break;
            case DisconnectReason.connectionClosed:
                log(chalk.yellow(`Connection closed, reconnecting....`));
                break;
            case DisconnectReason.connectionLost:
                log(chalk.yellow(`Connection Lost from Server, reconnecting...`));
                break;
            case DisconnectReason.connectionReplaced:
                log(chalk.red(`Connection Replaced, Another New Session Opened, Please Close Current Session First`));
                break;
            case DisconnectReason.loggedOut:
                log(chalk.red(`Device Logged Out, Please Scan Again And Run.`));
                break;
            case DisconnectReason.restartRequired:
                log(chalk.yellow(`Restart Required, Restarting...`));
                break;
            case DisconnectReason.timedOut:
                log(chalk.yellow(`Connection TimedOut, Reconnecting...`));
                break;
            default:
                log(chalk.red(`Unknown DisconnectReason: ${reason}`));
                break;
        }
        await this.initialize();
    }

    async getPhoneNumber() {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        return new Promise(resolve => {
            rl.question(chalk.yellow('Enter your WhatsApp number: '), num => {
                rl.close();
                resolve(num);
            });
        });
    }
}

(async () => {
    const bot = new WhatsAppBot();
    await bot.initialize();
})();
