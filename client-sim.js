const WebSocket = require('ws');
const crypto = require('crypto');
const readline = require('readline');

const SERVER_URL = 'ws://localhost:8080';
const DEVICE_ID = 'test-device-' + Math.random().toString(36).substring(7);

// Generate Key Pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Setup keyboard listener ONLY ONCE
let isKeyboardSetup = false;
let activeWs = null; // 始终指向最新的连接

function setupKeyboard(ws) {
    activeWs = ws;
    if (isKeyboardSetup) return;
    isKeyboardSetup = true;

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name === 'c') process.exit();
        
        const input = key.sequence || str;
        if (currentSessionId && input && activeWs && activeWs.readyState === WebSocket.OPEN) {
            activeWs.send(JSON.stringify({
                type: 'INPUT',
                sessionId: currentSessionId,
                content: input
            }));
        }
    });
}

function connect(isReconnect = false) {
    const ws = new WebSocket(SERVER_URL);
    
    // ... (rest of the socket setup)

    ws.on('open', () => {
        if (!isReconnect) {
            console.log('Connected to server');
            const pinFromArg = process.argv[2];
            if (pinFromArg) {
                ws.send(JSON.stringify({
                    type: 'AUTH',
                    pin: pinFromArg,
                    deviceId: DEVICE_ID,
                    publicKey: publicKey
                }));
            } else {
                rl.question('Enter PIN shown on server: ', (pin) => {
                    ws.send(JSON.stringify({
                        type: 'AUTH',
                        pin,
                        deviceId: DEVICE_ID,
                        publicKey: publicKey
                    }));
                });
            }
        } else {
            console.log('Attempting reconnect...');
            ws.send(JSON.stringify({
                type: 'AUTH_RECONNECT',
                deviceId: DEVICE_ID
            }));
        }
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        
        if (msg.type === 'AUTH_SUCCESS') {
            console.log('\nAuthentication Successful!');
            if (!isReconnect) {
                console.log('Closing and testing reconnect in 2 seconds...');
                ws.close();
                setTimeout(() => connect(true), 2000);
            } else {
                console.log('--- REMOTE CONTROL ACTIVE ---');
                setupKeyboard(ws);
            }
        } else if (msg.type === 'SESSION_LIST') {
            if (msg.sessions.length > 0) {
                currentSessionId = msg.sessions[0].id;
                // Auto attach to get history
                ws.send(JSON.stringify({ type: 'ATTACH', sessionId: currentSessionId }));
            }
        } else if (msg.type === 'DATA' || msg.type === 'HISTORY') {
            process.stdout.write(msg.content);
        } else if (msg.type === 'CHALLENGE') {
            // ... (keep challenge logic)
            const signer = crypto.createSign('SHA256');
            signer.update(msg.challenge);
            const signature = signer.sign(privateKey, 'hex');
            ws.send(JSON.stringify({
                type: 'AUTH_SIGNATURE',
                deviceId: DEVICE_ID,
                signature: signature
            }));
        }
    });

    ws.on('error', (err) => console.error('WS Error:', err.message));
}

console.log('Starting Client Simulator...');
console.log('Device ID:', DEVICE_ID);
connect();
