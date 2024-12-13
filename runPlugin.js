require('dotenv').config(); // Carrega as variáveis do .env

const axios = require('axios');
const SpeechRecognition = require('@google-cloud/speech');
const Influx = require('influx');
const { Configuration, OpenAIApi } = require('openai');

// Configurações
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Carregado do .env
const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY; // Carregado do .env
const configuration = new Configuration({ apiKey: GEMINI_API_KEY });
const openai = new OpenAIApi(configuration);
const client = new SpeechRecognition.SpeechClient();
const influx = new Influx.InfluxDB({
    host: 'localhost',
    database: 'superalgos_db',
    schema: [
        {
            measurement: 'commands',
            fields: { command: Influx.FieldType.STRING, response: Influx.FieldType.STRING },
            tags: ['host']
        }
    ]
});

// Função para registrar o plugin na interface do Superalgos
function registerPluginInUI(name, description) {
    console.log(`Registrando plugin: ${name} - ${description}`);
}

// Função Principal
async function main() {
    console.log('Iniciando Assistente Generativa...');

    const request = {
        config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: 'pt-BR',
        },
        interimResults: false
    };

    const recognizeStream = client
        .streamingRecognize(request)
        .on('data', async (data) => {
            try {
                const command = data.results[0].alternatives[0].transcript;
                console.log('Comando recebido:', command);

                const translatedCommand = await translateToEnglish(command);

                const response = await openai.createCompletion({
                    model: "text-davinci-003",
                    prompt: translatedCommand,
                    max_tokens: 150,
                });

                const iaResponse = await translateToPortuguese(response.data.choices[0].text);
                console.log('Resposta da IA:', iaResponse);

                executeCommand(iaResponse);
            } catch (error) {
                console.error('Erro no processamento de dados:', error);
            }
        })
        .on('error', (err) => {
            console.error('Erro no reconhecimento de voz:', err);
        });

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(2048, 1, 1);
            source.connect(processor);
            processor.connect(audioContext.destination);

            processor.onaudioprocess = function (e) {
                const audioData = e.inputBuffer.getChannelData(0);
                recognizeStream.write(audioData);
            };
        })
        .catch(err => {
            console.error('Erro ao acessar o microfone:', err);
        });

    influx.getDatabaseNames()
        .then(names => {
            if (!names.includes('superalgos_db')) {
                return influx.createDatabase('superalgos_db');
            }
            console.log('Conexão com InfluxDB bem-sucedida.');
        })
        .catch(err => {
            console.error('Erro ao conectar ao InfluxDB:', err);
        });

    registerPluginInUI('MyPlugin', 'Plugin para integração de IA generativa.');

    console.log('Plugin registrado na interface.');
}

function executeCommand(command) {
    if (command.includes('analisar dados')) {
        console.log('Executando análise de dados...');
        logToInflux(command, 'Análise de dados executada');
    } else if (command.includes('consultar histórico')) {
        console.log('Consultando histórico...');
        logToInflux(command, 'Histórico consultado');
    } else if (command.includes('gerar relatório')) {
        console.log('Gerando relatório...');
        logToInflux(command, 'Relatório gerado');
    } else if (command.includes('atualizar dados')) {
        console.log('Atualizando dados...');
        logToInflux(command, 'Dados atualizados');
    } else {
        console.log('Comando desconhecido:', command);
        logToInflux(command, 'Comando desconhecido');
    }
}

function logToInflux(command, response) {
    influx.writePoints([
        {
            measurement: 'commands',
            tags: { host: 'local' },
            fields: { command, response },
        }
    ]).catch(err => {
        console.error('Erro ao escrever no InfluxDB:', err);
    });
}

async function translateToEnglish(text) {
    try {
        const response = await axios.post('https://translation.googleapis.com/language/translate/v2', {
            q: text,
            target: 'en',
            key: GOOGLE_TRANSLATE_API_KEY
        });
        return response.data.data.translations[0].translatedText;
    } catch (error) {
        console.error('Erro na tradução para inglês:', error);
    }
}

async function translateToPortuguese(text) {
    try {
        const response = await axios.post('https://translation.googleapis.com/language/translate/v2', {
            q: text,
            target: 'pt',
            key: GOOGLE_TRANSLATE_API_KEY
        });
        return response.data.data.translations[0].translatedText;
    } catch (error) {
        console.error('Erro na tradução para português:', error);
    }
}

main();
