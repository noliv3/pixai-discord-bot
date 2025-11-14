module.exports = {
    name: 'r',
    description: 'Restart the bot (restricted user only)',

    async execute(message, client, args) {
        if (message.author.id !== '285092601449807872') {
            return;
        }

        try {
            await message.delete();
        } catch (err) {
            console.warn('❌ Could not delete command message:', err);
        }

        console.log('♻️ Restarting bot...');
        process.exit(0);
    }
};
