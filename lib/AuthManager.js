const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getUserDataDir } = require('./Utils');

class AuthManager {
    constructor() {
        this.pin = '';
        this.pinExpiry = null;
        this.trustedDevicesFile = path.join(getUserDataDir(), 'trusted_devices.json');
        this.trustedDevices = this.loadTrustedDevices();
        this.challenges = new Map(); // ws -> challenge
        this.generatePin();
    }

    generatePin() {
        this.pin = Math.floor(100000 + Math.random() * 900000).toString();
        this.pinExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        return this.pin;
    }

    isPinValid(inputPin) {
        if (!this.pin || !this.pinExpiry) return false;
        return this.pin === inputPin && new Date() < this.pinExpiry;
    }

    getRemainingTime() {
        if (!this.pinExpiry) return 0;
        const remaining = Math.max(0, this.pinExpiry - new Date());
        return Math.floor(remaining / 1000);
    }

    loadTrustedDevices() {
        if (fs.existsSync(this.trustedDevicesFile)) {
            try {
                return JSON.parse(fs.readFileSync(this.trustedDevicesFile, 'utf8'));
            } catch (e) {
                return {};
            }
        }
        return {};
    }

    addTrustedDevice(deviceId, publicKey) {
        this.trustedDevices[deviceId] = {
            publicKey: publicKey, // PEM formatted public key
            addedAt: new Date().toISOString(),
            lastUsed: new Date().toISOString()
        };
        this.saveTrustedDevices();
    }

    getDevicePublicKey(deviceId) {
        return this.trustedDevices[deviceId] ? this.trustedDevices[deviceId].publicKey : null;
    }

    generateChallenge(ws) {
        const challenge = crypto.randomBytes(32).toString('hex');
        this.challenges.set(ws, {
            challenge,
            expiry: Date.now() + 30000 // 30 seconds
        });
        return challenge;
    }

    verifySignature(ws, deviceId, signature) {
        const challengeData = this.challenges.get(ws);
        if (!challengeData || Date.now() > challengeData.expiry) return false;

        const keyData = this.getDevicePublicKey(deviceId);
        if (!keyData) return false;

        try {
            let params;
            try {
                params = JSON.parse(keyData);
            } catch (e) {
                console.error(`[AUTH] Invalid key format for device ${deviceId}. Please delete trusted_devices.json and re-pair.`);
                return false;
            }
            
            const n_hex = BigInt(params.modulus).toString(16);
            const n_buffer = Buffer.from(n_hex.length % 2 === 0 ? n_hex : '0' + n_hex, 'hex');
            
            const e_hex = BigInt(params.exponent).toString(16);
            const e_buffer = Buffer.from(e_hex.length % 2 === 0 ? e_hex : '0' + e_hex, 'hex');

            const publicKey = crypto.createPublicKey({
                key: {
                    kty: 'RSA',
                    n: n_buffer.toString('base64url'),
                    e: e_buffer.toString('base64url'),
                },
                format: 'jwk',
            });

            const verifier = crypto.createVerify('SHA256');
            verifier.update(challengeData.challenge);
            
            // Verify the signature (which we expect in Base64 from Flutter)
            const isValid = verifier.verify(publicKey, signature, 'base64');
            
            if (isValid) {
                this.challenges.delete(ws);
                this.trustedDevices[deviceId].lastUsed = new Date().toISOString();
                this.saveTrustedDevices();
            }
            return isValid;
        } catch (e) {
            console.error('Signature verification failed:', e);
            return false;
        }
    }

    saveTrustedDevices() {
        fs.writeFileSync(this.trustedDevicesFile, JSON.stringify(this.trustedDevices, null, 2));
    }
}

module.exports = new AuthManager();
