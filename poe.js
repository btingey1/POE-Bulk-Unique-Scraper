const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;

const primarySearchURL = 'https://www.pathofexile.com/trade/search/Sanctum/pgda63ei0';
const secondarySearchURL = 'https://www.pathofexile.com/trade/search/Sanctum/5BPq0weTa';
const minNumberOfItems = 3;
const minNumberOfItemsBig = 7;

let scraped_name = [];
let scraped_data = {};
(async () => {
    var browser = await puppeteer.launch({ headless: true });
    var page = await browser.newPage();
    console.log('Starting...');
    try {
        // Login Flow
        const cookiesString = await fs.readFile('./cookies.json');
        try {
            const cookies = JSON.parse(cookiesString);
            await page.setCookie(...cookies);
        } catch {
            console.log('Initializing setup...');
        }
        await page.goto(primarySearchURL, { timeout: 180000 })
        await delay(1000)
        const noUserStatus = await page.$('.login-dialog')

        // User Not Signed-In Flow
        if (noUserStatus) {
            console.log('WARNING: User action required, must sign-in with Steam.');
            await browser.close();
            var browser = await puppeteer.launch({ headless: false });
            var page = await browser.newPage();
            await page.goto('https://www.pathofexile.com/trade/', { timeout: 180000 })
            await page.waitForSelector(".login-button-group")
            await page.click('.login-button-group:nth-child(1)')
            await page.waitForSelector('.btn_green_white_innerfade')
            await page.click('.btn_green_white_innerfade')
            await page.waitForSelector('.btn_grey_white_innerfade')
            await page.click('.btn_grey_white_innerfade')
            await delay(1000);
            await page.waitForSelector('.profile')
            const cookies = await page.cookies();
            await fs.writeFile('cookies.json', JSON.stringify(cookies, null, 2));
            await browser.close();
            var browser = await puppeteer.launch({ headless: true });
            var page = await browser.newPage();
            const cookiesString = await fs.readFile('./cookies.json');
            const sesCookies = JSON.parse(cookiesString);
            await page.setCookie(...sesCookies);
            await page.goto(primarySearchURL, { timeout: 180000 })
        }


        // Find our 100 Users
        console.log('Searching...');
        await page.waitForSelector('.character-name')
        await page.evaluate(() => new Promise((resolve) => {
            let incrementer = 0;
            var scrollTop = -1;
            const interval = setInterval(() => {
                window.scrollBy(0, 90);
                if (document.documentElement.scrollTop !== scrollTop) {
                    scrollTop = document.documentElement.scrollTop;
                    return;
                }
                incrementer++
                console.log(incrementer);
                if (incrementer !== 2) {
                    return
                }
                clearInterval(interval);
                resolve();
            }, 200);
        }));

        // Grab Their Names
        let bodyHTML = await page.evaluate(() => document.body.innerHTML);
        let $ = cheerio.load(bodyHTML);
        let profileLinkEl = $('.profile-link')
        profileLinkEl.each((index, element) => {
            thisName = $(element).find('a').text()
            scraped_name.push({ 'name': thisName })
        })
        scraped_name.splice(0, 1)
        console.log(scraped_name, `Total number of users is ${scraped_name.length}.`);

        // Toggle the trade filter selector
        await page.goto('https://www.pathofexile.com/trade/search/Sanctum', { timeout: 180000 })
        await delay(1000)
        await page.waitForSelector('.filter-group:nth-child(9) button')
        await delay(500)
        let pageSelector = '.filter-group:nth-child(9) button'
        await page.evaluate((pageSelector) => document.querySelector(pageSelector).click(), pageSelector)
        await delay(500)

        // Check all users individually
        let place = 0;
        for (const accName of scraped_name) {
            console.log(`running for ${accName.name}, #${place}.`);
            place++;
            await page.goto(secondarySearchURL, { timeout: 180000 })
            await page.waitForSelector('.toggle-search-btn')
            await delay(400)
            await page.click('.toggle-search-btn')
            await delay(8000)
            await page.waitForSelector('.form-control.text')
            await page.type('.form-control.text', accName.name);
            await page.click('.btn.search-btn')

            // Try and see if user with thisn item exists
            try {
                await page.waitForSelector('.character-name', { timeout: 2000 })
                // Check their login / AFK status
                let status = await page.$(".status-away") || await page.$(".status-away")
                let bodyHTML = await page.evaluate(() => document.body.innerHTML);
                let $ = cheerio.load(bodyHTML);
                let numberListings = $('.row-total')
                let numberVal = $(numberListings).find('h3').text()
                let pageURL = page.url();
                numberVal = Number(numberVal.split(" ")[1])
                // Console Log if this user has more than 2 EDs
                if (numberVal >= minNumberOfItems && numberVal < minNumberOfItemsBig) console.log(`ALERT: ${numberVal} Eternal Damnations from '${accName.name}'. They are ${checkStatus(status)}. Goto: ${pageURL}.`);
                if (numberVal >= minNumberOfItemsBig) console.log(`🚨 BIG ALERT: ${numberVal} Eternal Damnations from '${accName.name}'. They are ${checkStatus(status)}. Goto: ${pageURL}.`);
                scraped_data[accName.name] = numberVal
            } catch {
                console.log(`${accName.name} unlisted.`);
            }
            await delay(800)
        }
        let sortedVals = Object.entries(scraped_data).sort((a, b) => b[1] - a[1]);
        console.log(sortedVals);
    }
    catch (err) {
        console.log(err);
        let sortedVals = Object.entries(scraped_data).sort((a, b) => b[1] - a[1]);
        console.log(sortedVals);
    }
    await browser.close();
    console.log('Search complete.');
})();


function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

function checkStatus(currentStatus) {
    if (currentStatus) return 'away'
    return 'online'
}
