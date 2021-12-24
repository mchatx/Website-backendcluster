const express = require("express")
const bodyParser = require("body-parser")
const request = require('request');
const puppeteer = require('puppeteer');
const Config = require('../Config/Config.json');

const PORT = Config.ScraperPort
const app = express()

app.use(bodyParser.json( { limit: '20mb'} ))
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }))

function parselink(linkstr){
  if (!linkstr){
      return "EMPTY";
  }

  switch(linkstr.substring(0,3)){
      case "YT_":
          return("https://www.youtube.com/watch?v=" + linkstr.substring(3));
      case "TW_":
          return("https://www.twitch.tv/videos/" + linkstr.substring(3));
      case "TC_":
          return("https://twitcasting.tv/" + linkstr.split("/")[0].split("_")[1] + "/movie/" + linkstr.split("/")[1]);
      case "NL_":
          return("https://live2.nicovideo.jp/watch/" + linkstr.substring(3));
      case "NC_":
          return("https://www.nicovideo.jp/watch/" + linkstr.substring(3));
      case "BL_":
          return("https://www.bilibili.com/video/" + linkstr.substring(3));
      default:
          return("EMPTY");
  }
}

app.post('/Request', async function (req, res) {
  if (!req.body.UID) {
    return res.status(400).send("NOT OK");
  }

  if (req.body.UID.length < 3){
    return res.status(400).send("NOT OK");
  }

  switch (req.body.UID.substring(0,3)) {
    case "YT_":
      var UID = req.body.UID.substring(3);
      request("https://www.youtube.com/watch?v=" + UID, function (error, response, body) {
        if (error){
          return res.status(400).send("NOT OK");
        }

        if ((body.indexOf('<meta name="title"') == -1) || (body.indexOf('<link itemprop="name"') == -1) || (body.indexOf('<link itemprop="name"') == -1)){
          return res.status(400).send("NOT OK");
        }

        var titleidx = body.indexOf('content="', body.indexOf('<meta name="title"'));
        var authoridx = body.indexOf('content="', body.indexOf('<link itemprop="name"'));
        var idx = body.indexOf('content="', body.indexOf('<meta itemprop="channelId"'));

        if ((titleidx == -1) || (authoridx == -1) || (idx == -1)){
          return res.status(400).send("NOT OK");
        }

        titleidx += ('content="').length;
        authoridx += ('content="').length;
        idx += ('content="').length;

        var title = body.substr(titleidx, body.indexOf('">', titleidx) - titleidx);
        var author = body.substr(authoridx, body.indexOf('">', authoridx) - authoridx);
        title = title.replace("&amp;", "&");
        const ChannelID = body.substr(idx, body.indexOf('">', idx) - idx);

        return res.status(200).json({
          UCID: "YT_" + ChannelID,
          Title: title,
          Author: author
        });
      });
      break;

    case "TW_":
      var UID = req.body.UID.substring(3);
      (async () => {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.goto('https://www.twitch.tv/videos/' + UID);
        
        var results = await page.evaluate(() => Array.from(document.querySelectorAll('h1'), function(e){ return { attr: e.outerHTML.replace(e.innerHTML, ""), content: e.textContent} } ));
        var results2 = await page.evaluate(() => Array.from(document.querySelectorAll('h2'), function(e){ return { attr: e.outerHTML.replace(e.innerHTML, ""), content: e.textContent} } ));

        results = results.filter(e => e.attr.indexOf('title') != -1).map(e => e.content);
        results2 = results2.filter(e => e.attr.indexOf('title') != -1).map(e => e.content);

        if ((results.length == 0) || (results2.length == 0)){
          await browser.close();
          return res.status(400).send("NOT OK");
        } else {
          results = results[0];
          results2 = results2[0];
          if (results2.lastIndexOf("•") != -1){
            results2 = results2.substring(0, results2.lastIndexOf("•"));
          } else if (results2.lastIndexOf("·") != -1) {
            results2 = results2.substring(0, results2.lastIndexOf("·"));
          }
         
          await browser.close();
          return res.status(200).json({
            UCID: "TW_" + results,
            Title: results2.trim(),
            Author: results
          });
        }
      })();
      break;

    case "TC_":
      var UID = req.body.UID.split("/")[1];
      var UIDName = req.body.UID.split("/")[0].substring(3);;

      request('https://twitcasting.tv/' + UIDName + '/movie/' + UID, function (error, response, body) {
        if (error){
          return res.status(400).send("NOT OK");
        }
        
        if ((body.indexOf('data-user-id="' + UIDName + '"') != -1) && (body.indexOf('data-movie-id="' + UID + '"') != -1)){
          var TargetElement = '<span class="tw-movie-thumbnail-title">';
          var text = body.substring(body.indexOf(TargetElement) + TargetElement.length);
          text = text.substring(0, text.indexOf('</span>'));
          text = text.substring(0, text.lastIndexOf('#'));

          var TargetElement2 = '<span class="tw-user-nav-name">';
          var text2 = body.substring(body.indexOf(TargetElement2) + TargetElement2.length);
          text2 = text2.substring(0, text2.indexOf('</span>'));
          
          return res.status(200).json({
            UCID: "TC_" + UIDName,
            Title: text.trim(),
            Author: text2.trim()
          });
        
        } else {
          return res.status(400).send("NOT OK");          
        }
      });      
      break;

    case "NC_":
      var UID = req.body.UID.substring(3);
      request('https://www.nicovideo.jp/watch/' + UID, function (error, response, body) {
        if (error){
          return res.status(400).send("NOT OK");
        }

        const idx = body.indexOf('<a class="Link VideoOwnerInfo-pageLink" href="');
        if (idx == - 1){
          return res.status(400).send("NOT OK");
        }

        var result = body.substring(idx + ('<a class="Link VideoOwnerInfo-pageLink" href="').length, body.indexOf('"', idx + ('<a class="Link VideoOwnerInfo-pageLink" href="').length));
        if (result.indexOf("?") != -1){
          result = result.substring(0, result.indexOf("?"));
        }

        if (body.indexOf('<section class="ErrorMessage WatchExceptionPage-message">') != -1){
          return res.status(400).send("NOT OK");           
        } 
        
        var dt = body.substring(body.indexOf('<script type="application/ld+json">') + ('<script type="application/ld+json">').length);
        dt = dt.substring(0, dt.indexOf('</script>'));
        dt = JSON.parse(dt);

        request(result, function (error2, response2, body2) {
          if (error2){
            return res.status(400).send("NOT OK");
          }

          var hrefuri = response2.request.uri.href;

          if (hrefuri.lastIndexOf("/") != -1){
            hrefuri = hrefuri.substring(hrefuri.lastIndexOf("/") + 1);
          }  

          if (hrefuri.indexOf("?") != -1){
            hrefuri = hrefuri.substring(0, hrefuri.indexOf("?"));
          }  

          return res.status(200).json({
            UCID: "NC_" + hrefuri,
            Title: dt["name"].trim(),
            Author: dt["author"]["name"]
          });
        });
      });
      break;

    case "BL_":
      var UID = req.body.UID.substring(3);
      (async () => {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.goto('https://www.bilibili.com/video/' + UID);
        if (await page.$('.tit') !== null) {
          const results = await page.$('.tit');
          var text = await results.evaluate(element => element.textContent);

          var results2 = await page.evaluate(() => Array.from(document.querySelectorAll('a'), function(e){ return { class: e.className, content: e.href, text: e.textContent } } ));
          results2 = results2.filter(e => e.class.indexOf("username") != -1);
          
          if (results2.length == 0){
            return res.status(400).send("NOT OK");
          }

          results2 = results2[0]
          results2.content = results2.content.replace("https://space.bilibili.com/", "");
          if (results2.content.indexOf("/") != -1){
            results2.content = results2.content.substring(0, results2.content.indexOf("/"));
          }  
          if (results2.content.indexOf("?") != -1){
            results2.content = results2.content.substring(0, results2.content.indexOf("?"));
          }  

          await browser.close();
          return res.status(200).json({
            UCID: "BL_" + results2.content.trim(),
            Title: text.trim(),
            Author: results2.text.trim()
          });
        } else {
          await browser.close();
          return res.status(400).send("NOT OK");
        }
      })();
      break;

    default:
      return res.status(400).send("NOT OK");
  }
})

app.post('/Live', async function (req, res) {

  if (!req.body.UID) {
    return res.status(400).send("NOT OK");
  }

  if (req.body.UID.length < 3){
    return res.status(400).send("NOT OK");
  }

  switch (req.body.UID.substring(0,3)) {
    case "YT_":
      var UID = req.body.UID.substring(3);
      request("https://www.youtube.com/watch?v=" + UID, function (error, response, body) {
        if (error){
          return res.status(400).send("NOT OK");
        }

        if ((body.indexOf('<meta name="title"') == -1) || (body.indexOf('<link itemprop="name"') == -1) || (body.indexOf('<link itemprop="name"') == -1)){
          return res.status(400).send("NOT OK");
        }

        var titleidx = body.indexOf('content="', body.indexOf('<meta name="title"'));
        var authoridx = body.indexOf('content="', body.indexOf('<link itemprop="name"'));
        var idx = body.indexOf('content="', body.indexOf('<meta itemprop="channelId"'));

        if ((titleidx == -1) || (authoridx == -1) || (idx == -1)){
          return res.status(400).send("NOT OK");
        }

        titleidx += ('content="').length;
        authoridx += ('content="').length;
        idx += ('content="').length;

        var title = body.substr(titleidx, body.indexOf('">', titleidx) - titleidx);
        var author = body.substr(authoridx, body.indexOf('">', authoridx) - authoridx);
        title = title.replace("&amp;", "&");
        const ChannelID = body.substr(idx, body.indexOf('">', idx) - idx);

        return res.status(200).json({
          UCID: "YT_" + ChannelID,
          Title: title,
          Author: author
        });
      });
      break;

    case "TW_":
      var UID = req.body.UID.substring(3);
      (async () => {
        const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.goto('https://www.twitch.tv/' + UID);
        
        var results = await page.evaluate(() => Array.from(document.querySelectorAll('h1'), function(e){ return { attr: e.outerHTML.replace(e.innerHTML, ""), content: e.textContent} } ));
        var results2 = await page.evaluate(() => Array.from(document.querySelectorAll('h2'), function(e){ return { attr: e.outerHTML.replace(e.innerHTML, ""), content: e.textContent} } ));

        results = results.filter(e => e.attr.indexOf('TitleText') != -1).map(e => e.content);
        results2 = results2.filter(e => e.attr.indexOf('title=') != -1).map(e => e.content);

        if ((results.length == 0) || (results2.length == 0)){
          await browser.close();
          return res.status(400).send("NOT OK");
        } else {
          results = results[0];
          results2 = results2[0];
         
          await browser.close();
          return res.status(200).json({
            UCID: "TW_" + results,
            Title: results2.trim(),
            Author: results
          });
        }
      })();      
      break;

    case "TC_":
      var UID = req.body.UID.substring(3);
      request('https://twitcasting.tv/' + UID, function (error, response, body) {
        if (error){
          return res.status(400).send("NOT OK");
        }

        if (body.indexOf('data-user-id="' + UID + '"') != -1){
          var TargetElement = 'data-broadcaster-name="';
          var text = body.substring(body.indexOf(TargetElement) + TargetElement.length);
          text = text.substring(0, text.indexOf('"'));

          var TargetElement2 = '<span class="tw-movie-thumbnail-title">';
          var text2 = body.substring(body.indexOf(TargetElement2) + TargetElement2.length);
          text2 = text2.substring(0, text2.indexOf('</span>'));
          
          return res.status(200).json({
            UCID: "TC_" + UID,
            Title: text2.trim(),
            Author: text.trim()
          });
        } else {
          return res.status(400).send("NOT OK");          
        }
      });     
      break;

    case "NC_":
      var UID = req.body.UID.substring(3);
      request('https://live.nicovideo.jp/watch/' + UID, function (error, response, body) {
        if (error){
          return res.status(400).send("NOT OK");
        }

        var idx = body.indexOf("channel-name-anchor");
        idx = body.indexOf('href="', idx);
        var result = body.substring(idx + ('href="').length, body.indexOf('"', idx + ('href="').length));
        if (result.indexOf("?") != -1){
          result = result.substring(0, result.indexOf("?"));
        }

        var dt = body.substring(body.indexOf('<script type="application/ld+json">') + ('<script type="application/ld+json">').length);
        dt = dt.substring(0, dt.indexOf('</script>'));
        dt = JSON.parse(dt);

        request(result, function (error2, response2, body2) {
          if (error2){
            return res.status(400).send("NOT OK");
          }

          var hrefuri = response2.request.uri.href;

          if (hrefuri.lastIndexOf("/") != -1){
            hrefuri = hrefuri.substring(hrefuri.lastIndexOf("/") + 1);
          }  

          if (hrefuri.indexOf("?") != -1){
            hrefuri = hrefuri.substring(0, hrefuri.indexOf("?"));
          }  

          return res.status(200).json({
            UCID: "NC_" + hrefuri,
            Title: dt["name"].trim(),
            Author: dt["author"]["name"]
          });
        });
      });
      break;

    case "BL_":
      var UID = req.body.UID.substring(3);
      
      (async () => {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.goto('https://live.bilibili.com/' + UID);

        var results = await page.evaluate(() => Array.from(document.querySelectorAll('a'), function(e){ return { class: e.className, content: e.href, text: e.textContent} } ));
        var results2 = await page.evaluate(() => Array.from(document.querySelectorAll('span'), function(e){ return { class: e.className, text: e.textContent} } ));

        results = results.filter(e => e.class.indexOf("owner") != -1);
        results2 = results2.filter(e => e.class.indexOf("title") != -1);
        
        if ((results.length == 0)){
          await browser.close();
          return res.status(400).send("NOT OK");
        } else {
          results = results[0];
          results2 = results2[0];
          results.content = results.content.replace("https://space.bilibili.com/", "");
          if (results.content.indexOf("/") != -1){
            results.content = results.content.substring(0, results.content.indexOf("/"));
          }  
          if (results.content.indexOf("?") != -1){
            results.content = results.content.substring(0, results.content.indexOf("?"));
          }  

          await browser.close();
          return res.status(200).json({
            UCID: "BL_" + results.content,
            Title: results2.text,
            Author: results.text
          });
        }
      })();
      break;

    default:
      return res.status(400).send("NOT OK");
  }
})

app.listen(PORT, async function () {
  console.log(`Server initialized on port ${PORT}`);
})

//curl -X POST -H "Content-Type: application/json" --data "{ \"UID\":\"YT_2Wi05NwwjUE\" }"  http://localhost:36912/Request/
//curl -X POST -H "Content-Type: application/json" --data "{ \"UID\":\"TW_483177546\" }"  http://localhost:36912/Request/
//curl -X POST -H "Content-Type: application/json" --data "{ \"UID\":\"TC_akirosenthal/692665562\" }"  http://localhost:36912/Request/
//curl -X POST -H "Content-Type: application/json" --data "{ \"UID\":\"NC_so38956256\" }"  http://localhost:36912/Request/
//curl -X POST -H "Content-Type: application/json" --data "{ \"UID\":\"BL_BV1Dq4y1X7q5\" }"  http://localhost:36912/Request/

//curl -X POST -H "Content-Type: application/json" --data "{ \"UID\":\"YT_2Wi05NwwjUE\" }"  http://localhost:36912/Live/
//curl -X POST -H "Content-Type: application/json" --data "{ \"UID\":\"TW_hanjoudesu\" }"  http://localhost:36912/Live/
//curl -X POST -H "Content-Type: application/json" --data "{ \"UID\":\"TC_deoxymole\" }"  http://localhost:36912/Live/
//curl -X POST -H "Content-Type: application/json" --data "{ \"UID\":\"NC_lv332840343\" }"  http://localhost:36912/Live/
//curl -X POST -H "Content-Type: application/json" --data "{ \"UID\":\"BL_6477824\" }"  http://localhost:36912/Live/
