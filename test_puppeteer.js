const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();

    // Sender
    const page1 = await browser.newPage();
    await page1.goto('http://localhost:3000');

    const fileInput = await page1.$('#fileInput');
    await fileInput.uploadFile('/tmp/test_transfer.txt');

    await page1.click('#sendBtn');

    await page1.waitForSelector('#codeDisplay');
    const code = await page1.$eval('#codeDisplay', el => el.innerText);
    console.log('Got code:', code);

    // Receiver
    const page2 = await browser.newPage();
    await page2.goto('http://localhost:3000');

    await page2.type('#joinCode', code);
    await page2.click('#receiveBtn');

    // Wait for outcome on receiver
    try {
        await page2.waitForSelector('#downloadContainer', { timeout: 5000, visible: true });
        console.log('Download container is VISIBLE! Transfer successful.');
    } catch (e) {
        console.log('Transfer failed or timed out on receiver.');
        const receiveBtnText = await page2.$eval('#receiveBtn', el => el.innerText);
        const progress = await page2.$eval('#progressBarInner', el => el.style.width).catch(() => 'no progress');
        console.log('Receive Btn Text:', receiveBtnText);
        console.log('Progress Width:', progress);
    }

    // Check sender status
    const senderStatus = await page1.$eval('#sendStatus', el => el.innerText);
    console.log('Sender Status:', senderStatus);

    await browser.close();
})();
