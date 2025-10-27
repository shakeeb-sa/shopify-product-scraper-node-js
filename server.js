const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const os = require('os');
const csv = require('fast-csv');

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Home page
app.get('/', (req, res) => {
  res.render('index');
});

// Scrape endpoint
app.post('/scrape', async (req, res) => {
  const { url } = req.body;

  if (!url || !url.includes('famousjackets.com')) {
    return res.render('result', { error: 'Please enter a valid Famous Jackets product URL.' });
  }

  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);

    // --- Extract Title from <title> tag (your HTML shows: "Product | Famous Jackets") ---
    let title = 'N/A';
    const titleTag = $('title').text().trim();
    if (titleTag) {
      title = titleTag.split('|')[0].trim();
    }

    // --- Extract Price from Open Graph meta tags (confirmed in your HTML) ---
    const priceAmount = $('meta[property="og:price:amount"]').attr('content') || '';
    const priceCurrency = $('meta[property="og:price:currency"]').attr('content') || '';
    const price = priceAmount && priceCurrency ? `${priceAmount} ${priceCurrency}` : 'N/A';

    // --- Extract Main Image from og:image ---
    const image = $('meta[property="og:image:secure_url"]').attr('content') ||
                  $('meta[property="og:image"]').attr('content') || 'N/A';

    // --- Extract Description from meta tags ---
    const description = $('meta[property="og:description"]').attr('content') ||
                        $('meta[name="description"]').attr('content') || 'N/A';

    const product = {
      title,
      price,
      description: description.length > 500 ? description.substring(0, 500) + '...' : description,
      image_url: image,
      product_url: url
    };

    // --- Generate CSV ---
    const csvPath = path.join(os.tmpdir(), `product_${Date.now()}.csv`);
    const ws = fs.createWriteStream(csvPath);
    const csvStream = csv.format({ headers: true });

    csvStream.pipe(ws);
    csvStream.write(product);
    csvStream.end();

    // Wait for file to finish writing
    ws.on('finish', () => {
      res.render('result', {
        product,
        csvUrl: `/download?file=${encodeURIComponent(csvPath)}`
      });
    });

  } catch (err) {
    console.error(err);
    res.render('result', {
      error: `Scraping failed: ${err.message || 'Unknown error'}`
    });
  }
});

// Download CSV
app.get('/download', (req, res) => {
  const filePath = decodeURIComponent(req.query.file);
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'famousjackets_product.csv');
  } else {
    res.status(404).send('File not found');
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});