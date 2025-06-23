const axios = require('axios');

async function fetchPixAI(prompt) {
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    if (process.env.PIXAI_API_KEY) {
        headers['Authorization'] = `Bearer ${process.env.PIXAI_API_KEY}`;
    }

    const payload = {
        query: `mutation createGenerationTask($parameters: JSONObject!) {\n            createGenerationTask(parameters: $parameters) {\n                outputs\n            }\n        }`,
        variables: {
            parameters: { prompt }
        }
    };

    try {
        const response = await axios.post('https://api.pixai.art/graphql', payload, { headers });
        const task = response.data && response.data.data && response.data.data.createGenerationTask;
        if (task && Array.isArray(task.outputs) && task.outputs.length > 0) {
            const output = task.outputs[0];
            if (typeof output === 'string') {
                return output;
            }
            if (output && output.url) {
                return output.url;
            }
        }
    } catch (error) {
        console.error('PixAI error:', error.response ? error.response.data : error.message);
    }
    return null;
}

module.exports = {
    name: 'pixai',
    description: 'Generate image via PixAI',
    async execute(message, client, args) {
        const prompt = args.join(' ');
        if (!prompt) {
            message.reply('Please provide a prompt.');
            return;
        }
        const url = await fetchPixAI(prompt);
        if (url) {
            await message.reply(url);
        } else {
            await message.reply('Failed to generate image.');
        }
    },
    fetchPixAI
};
