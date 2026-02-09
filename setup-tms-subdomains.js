// Quick Setup Script for TMS Subdomains
// Run this in your browser console on the dashboard (http://localhost:3000)
// to automatically add all 17 subdomains

// IMPORTANT: Replace 'example.com' with your actual TMS domain
const TMS_DOMAIN = 'example.com'; // ← CHANGE THIS!

const subdomains = [
    'tms13', 'tms17', 'tms18', 'tms32', 'tms34', 'tms35', 'tms41', 'tms45',
    'tms55', 'tms57', 'tms59', 'tms61', 'tms63', 'tms64', 'tms74', 'tms77', 'tms87'
];

async function addAllSubdomains() {
    console.log(`🚀 Adding ${subdomains.length} TMS subdomains...`);

    for (const subdomain of subdomains) {
        const url = `https://${subdomain}.${TMS_DOMAIN}`;
        const name = `TMS ${subdomain.replace('tms', '')}`;
        const scriptId = subdomain;

        try {
            const response = await fetch('/api/subdomains', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, name, scriptId, enabled: true })
            });

            const result = await response.json();
            if (result.success) {
                console.log(`✅ Added: ${name} (${url})`);
            } else {
                console.error(`❌ Failed to add ${name}`);
            }

            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
            console.error(`❌ Error adding ${name}:`, error);
        }
    }

    console.log(`\n✅ Done! Added ${subdomains.length} subdomains.`);
    console.log('Refresh the page to see them in the dashboard.');
}

// Auto-run
addAllSubdomains();
