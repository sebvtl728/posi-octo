import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  console.log("Fetching templates from Firestore...");
  const querySnapshot = await getDocs(collection(db, 'templates'));
  console.log(`\n=== Posi-octo Templates (${querySnapshot.size} docs) ===`);
  
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    const name = data.name || 'Unnamed';
    const type = data.type || 'Unknown';
    const html = data.htmlContent || '';
    
    console.log(`\nTemplate ID: ${doc.id} | Name: "${name}" | Type: "${type}"`);
    console.log(`  - HTML length: ${html.length}`);
    
    // Check if HTML contains "signature", "canvas", "saveSignature", "clearSignature"
    const hasSignature = html.toLowerCase().includes('signature');
    const hasCanvas = html.toLowerCase().includes('canvas');
    const hasSave = html.includes('saveSignature');
    const hasClear = html.includes('clearSignature');
    
    console.log(`  - Mentions "signature": ${hasSignature}`);
    console.log(`  - Mentions "canvas": ${hasCanvas}`);
    console.log(`  - Mentions "saveSignature": ${hasSave}`);
    console.log(`  - Mentions "clearSignature": ${hasClear}`);
    
    // Let's print some lines matching canvas or signature
    if (hasSignature || hasCanvas) {
      console.log(`  - Code snippet around signature/canvas:`);
      const lines = html.split('\n');
      lines.forEach((line, i) => {
        if (line.toLowerCase().includes('signature') || line.toLowerCase().includes('canvas')) {
          console.log(`    Line ${i+1}: ${line.trim().substring(0, 120)}`);
        }
      });
    }
  });
}

run().catch(console.error);
