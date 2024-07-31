const fs = require('fs');
const path = require('path');
const { Wallets } = require('fabric-network');

async function main() {
  try {
    const walletPath = path.join(__dirname, 'Wallet_votoElectronicoBD');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const certPath = path.join(__dirname, 'fabric-network/crypto-config/artifacts/crypto/peerOrganizations/VotoBlockchain/users/bmogrovejog@hotmail.com/msp/signcerts');
    const keyPath = path.join(__dirname, 'fabric-network/crypto-config/artifacts/crypto/peerOrganizations/VotoBlockchain/users/bmogrovejog@hotmail.com/msp/keystore');
    
    const cert = fs.readFileSync(path.join(certPath, 'cert.pem')).toString();
    const keyFiles = fs.readdirSync(keyPath);
    const key = fs.readFileSync(path.join(keyPath, keyFiles[0])).toString();

    const identityLabel = 'bmogrovejog@hotmail.com';
    const identity = {
      credentials: {
        certificate: cert,
        privateKey: key,
      },
      mspId: 'VotoBlockchain',
      type: 'X.509',
    };

    await wallet.put(identityLabel, identity);
    console.log(`Successfully imported identity: ${identityLabel}`);
  } catch (error) {
    console.error(`Failed to import identity: ${error}`);
    process.exit(1);
  }
}

main();
