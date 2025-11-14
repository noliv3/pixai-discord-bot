const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const ftp = require('basic-ftp');
const ftpConfig = require('../config/ftp.json');

module.exports = {
    name: 'zip',

    async execute(message, client, args) {
        const cmdArgs = args && args.length ? args : message.content.trim().split(' ').slice(1);
        const eventName = cmdArgs[0];
        const topArg = cmdArgs[1];

        if (!eventName) {
            return message.reply('❌ Usage: `!zip <eventname> [topX]`');
        }

        const folderPath = path.join(__dirname, '..', 'event_files', eventName);
        if (!fs.existsSync(folderPath)) {
            return message.reply(`❌ No folder found for event \`${eventName}\`.`);
        }

        let files = fs.readdirSync(folderPath).filter(f =>
            ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f).toLowerCase())
        );

        if (files.length === 0) {
            return message.reply(`📭 No image files found for event \`${eventName}\`.`);
        }

        files = files.map(filename => {
            const match = filename.match(/_rate(\d+)_/);
            const score = match ? parseInt(match[1]) : 0;
            return { filename, score };
        }).sort((a, b) => b.score - a.score);

        let topLimit = null;
        if (topArg && /^top\d+$/i.test(topArg)) {
            topLimit = parseInt(topArg.replace(/top/i, ''));
            files = files.slice(0, topLimit);
        }

        const zip = new AdmZip();
        for (const entry of files) {
            zip.addLocalFile(path.join(folderPath, entry.filename));
        }

        const zipName = topLimit ? `${eventName}_top${topLimit}.zip` : `${eventName}_all.zip`;

        const tempPath = path.join(__dirname, '..', 'temp');
        if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath);
        const zipPath = path.join(tempPath, zipName);
        zip.writeZip(zipPath);

        const clientFtp = new ftp.Client();
        try {
            await clientFtp.access({
                host: ftpConfig.host,
                user: ftpConfig.user,
                password: ftpConfig.password,
                secure: ftpConfig.secure || false
            });

            await clientFtp.ensureDir(ftpConfig.remoteDir || '/');
            await clientFtp.uploadFrom(zipPath, zipName);
            clientFtp.close();

            const publicUrl = `${ftpConfig.publicUrl}/${zipName}`;
            await message.reply(`📁 ZIP uploaded: ${publicUrl}`);
        } catch (err) {
            console.error('❌ FTP upload failed:', err);
            await message.reply('❌ FTP upload failed.');
            clientFtp.close();
        }
    }
};
