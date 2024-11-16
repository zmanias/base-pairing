const { default: makeWASocket, proto } = require('@whiskeysockets/baileys');

exports.socket = (...args) => {
    let core = makeWASocket(...args);
    Object.defineProperty(core, 'name', {
        value: 'WASocket',
        configurable: true,
    });
    core.parseMention = (text = "") => {
     return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map((v) => v[1] + "@s.whatsapp.net");
    };
    core.reply = async (jid, text, quoted, options) => {
     await core.sendPresenceUpdate('composing', jid)
     return core.sendMessage(jid, {text: text, mentions: core.parseMention(text), ...options}, { quoted})
   };
  return core;
};

exports.smsg = (core, m) => {
    if (!m) return m;
    const M = proto.WebMessageInfo;
    m = M.fromObject(m);
    if (m.key) {
        m.id = m.key.id;
        m.isBaileys = m.id && (m.id.length === 16 || m.id.startsWith('3EB0') && m.id.length === 12);
        m.chat = m.key.remoteJid || m.message?.senderKeyDistributionMessage?.groupId || '';
        m.isGroup = m.chat.endsWith('@g.us');
        m.sender = m.key.fromMe ? m.key.remoteJid : m.key.participant || m.chat;
        m.fromMe = m.key.fromMe;
    }

    if (m.message) {
        const mtype = Object.keys(m.message);
        m.mtype = mtype.find(t => !['senderKeyDistributionMessage', 'messageContextInfo'].includes(t)) || mtype[mtype.length - 1];
        m.msg = m.message[m.mtype];
        m.text = m.msg.text || m.msg.caption || m.msg.contentText || '';

        if (typeof m.text !== 'string') {
            m.text = m.text.selectedDisplayText || m.text.hydratedTemplate?.hydratedContentText || '';
        }

        m.mentionedJid = m.msg?.contextInfo?.mentionedJid || [];

        const quoted = m.quoted = m.msg?.contextInfo?.quotedMessage || null;
        if (quoted) {
            const type = Object.keys(quoted)[0];
            m.quoted = quoted[type];
            m.quoted.mtype = type;
            m.quoted.id = m.msg.contextInfo.stanzaId;
            m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat || m.sender;
            m.quoted.isBaileys = m.quoted.id && m.quoted.id.length === 16;
            m.quoted.sender = m.msg.contextInfo.participant;
            m.quoted.fromMe = m.quoted.sender === m.key.remoteJid;
            m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.contentText || '';
        }
    }

    return m;
};
