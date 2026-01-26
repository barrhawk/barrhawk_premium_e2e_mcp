
import fs from 'fs';
import path from 'path';
import readline from 'readline';

/**
 * The Thought Architect - Pre-flight Interlock Protocol
 */
const questions = [
    {
        id: "destination",
        text: "1. The Destination (Telos):\n   What exactly does the user see when this works? (Be specific)",
        placeholder: "e.g. Dashboard renders green badge"
    },
    {
        id: "map",
        text: "2. The Map (Topography):\n   Where does data start, end, and flow? (Source -> Conduit -> Sink)",
        placeholder: "e.g. API -> WebSocket -> Redux Store"
    },
    {
        id: "moist",
        text: "3. The Failure Binary (Moistness):\n   What is the single condition that makes success impossible?",
        placeholder: "e.g. Port 3000 is blocked"
    },
    {
        id: "hops",
        text: "4. The Verification (Checkpoints):\n   Define the hops. No hop > 1 minute verification.",
        placeholder: "e.g. 1. Curl endpoint, 2. Check DB, 3. View UI"
    }
];

export async function runThoughtArchitect() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log("\n🏛️  THE THOUGHT ARCHITECT 🏛️\n");
    console.log("Commencing Pre-Flight Interlock Protocol...\n");

    const answers: Record<string, string> = {};

    for (const q of questions) {
        console.log(`\n${q.text}`);
        console.log(`   (Hint: ${q.placeholder})`);

        await new Promise<void>(resolve => {
            rl.question('   > ', (answer) => {
                answers[q.id] = answer.trim() || "Skipped";
                resolve();
            });
        });
    }

    rl.close();

    const timestamp = new Date().toISOString().split('T')[0];
    const content = `# Flight Plan: [Task Name]
Date: ${timestamp}

## 1. The Destination (Telos)
${answers.destination}

## 2. The Map (Topography)
${answers.map}

## 3. The Failure Binary (Moistness)
${answers.moist}

## 4. Checkpoints (The Verification)
${answers.hops.split(',').map((h, i) => `- [ ] Hop ${i + 1}: ${h.trim()}`).join('\n')}

## 5. Ground Truth (The Tarmac)
- [ ] \`pwd\` matches project root
- [ ] \`node --version\` is compatible
- [ ] Target files exist
`;

    const filename = 'checkpoints.md';
    fs.writeFileSync(filename, content);

    console.log(`\n✅ Flight Plan generated: ${filename}`);
    console.log("   Review it. Verify Hop 0. Then fly.");
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runThoughtArchitect();
}
