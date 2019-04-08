const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const parseString = require('xml2js').parseString;
const request = require('request')
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const htmlparser = require("htmlparser");

const app = express();
const port = process.env.PORT || 5000;

const GOODREADSKEY = "?key=ti9oQDpnonZyUjpP83lBg";

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});


app.listen(port, () => console.log(`Listening on port ${port}`));

app.use(express.static(path.join(__dirname, 'build')));

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

//Function that handles autocomplete requests, i.e unfinished string like: "i","ib","ibs","ibse"....
//And responds with a suggestion, like "Henrik Ibsen"
//Adding autocomplete counter to not send back too old requests
var atocompleteCounter = 1;

app.post('/searchString/', async (req, res, next) => {
    try{
        const searchString = req.body.string;
        if(searchString!=''){
            var sendValue = atocompleteCounter+0;
            atocompleteCounter++;
            requestSearchString(searchString, sendValue, function(responseObj,sendBackValue){

                if(sendBackValue >= atocompleteCounter-1){
                    res.send(responseObj);
                }
                else{
                    //Don't send anything, let request timeout
                }
            })
        }
    }
    catch(e){
        console.log(e);
    }
});






//call goodreads to check name
function requestSearchString(string, sendValue, callback){
    const urlString = "https://www.goodreads.com/api/author_url/"+string+GOODREADSKEY;
    var nameString;
    request(urlString, { json: true }, (err, res, body) => {

        if (err) { return console.log(err); }

        //Parsin XML response
        parseString(body, function (err, result) {
            var responseObj = {
                name : result.GoodreadsResponse.author[0].name[0],
                id : result.GoodreadsResponse.author[0].$.id
            }
            //const nameString = result.GoodreadsResponse.author[0].name[0];
            //console.log(result.GoodreadsResponse.author[0].$.id);
            //console.log(result.GoodreadsResponse.author[0].name);
            callback(responseObj,sendValue);
        });
    });

}

//TODO Full nameSearch
app.post('/fullSearch/', (req, res) => {
    console.log(req.body);
    const id = req.body.id;
    requestFullResponseJson(id, function(responseObj){


        res.send(responseObj);

    })
});

app.post('/bergenBiblAuthor/', (req,res) => {
    const authorName = req.body.authorName;

    requestBBBookArray(authorName, function(responseObj){
        res.send(responseObj)
    })
})

app.post('/bergenBiblBook', (req,res) => {
    const bookUrl = req.body.url;

    getBookDetails(bookUrl, function(responseString){
        console.log("sending book location");
        res.send({location:responseString})
    })


})

function requestFullResponseJson(id, callback){
    var jsonResponse = {};
    requestFullGoodReads(id, function(responseObj){
        callback(responseObj);
    })
}


function requestFullGoodReads(id,callback){
    const urlString = "https://www.goodreads.com/author/show/"+id+GOODREADSKEY;
    request(urlString, (err, res, body) => {

        if (err) { return console.log(err); }

        //Parsing XML response from GR and make more parsable response object to client
        parseString(body, function (err, result) {

            const returnObject = {
                id: result.GoodreadsResponse.author[0].id[0],
                name: result.GoodreadsResponse.author[0].name[0],
                imageUrl : result.GoodreadsResponse.author[0].image_url[0],
                aboutHtmlString : result.GoodreadsResponse.author[0].about[0],
                bornString : result.GoodreadsResponse.author[0].born_at[0],
                deathString : result.GoodreadsResponse.author[0].died_at[0],
                worksInt : result.GoodreadsResponse.author[0].works_count[0],
                hometown : result.GoodreadsResponse.author[0].hometown[0],
                booksArray : result.GoodreadsResponse.author[0].books[0].book
            }
            console.log("Calling Back");
            callback(returnObject);
        });
    });
}

const bbArrayUrl = "https://mitt.bergenbibliotek.no/cgi-bin/m?mode=vt&pubsok_txt_0=";
var urlAvgrensEngelsk = "&avgr_medier=ff=l&pubsok_kval_1=FO&allemedietyper=off&avgr_spraak=sp=eng";

function requestBBBookArray(authorName,callback){
    var returnArray = [];
    request(bbArrayUrl+authorName+urlAvgrensEngelsk, (err, res, body) => {
        if (err) { return console.log(err); }
        const window = (new JSDOM(body)).window;
        const bookResults = window.document.getElementById("results");
        const booksArray = bookResults.getElementsByTagName('li');
        try{
            for(var i=1;i<booksArray.length;i++){
    			var element = booksArray[i].getElementsByTagName('a')[0];
    			var bookUrl = element.getAttribute('href');
    			var title = element.firstChild.nextSibling.nextSibling.textContent.trim();
                var isAvailable; // declared later
                //Copy-past from last book project
                var spans = element.getElementsByTagName('span');
    			var spansCounter = 0;

    			//var authorBB = spans[spansCounter].textContent.trim();
    			spansCounter++;

    			var published = parseInt(spans[spansCounter].textContent);
    			//Sometimes the next spans is conten type (like "Book"), and sometimes there is no such thing
    			if(isNaN(published)){
    				spansCounter++;
    				published = parseInt(spans[spansCounter].textContent);
    			}
    			spansCounter++;

    			//Thinking about using this DOM directly in my own code. May be a no-no security wise.
    			var ledigDom = spans[spansCounter];
                //Sometimes the DOM returns null here, if so ignore this book
    			if(ledigDom.getAttribute('class')!=null){

    				//Checks if available
    				if(ledigDom.getAttribute('class').includes('bs-ledig')){

    					isAvailable = true;
    				}
    				else{
    					isAvailable = false;
    				}
                    var pushObject = {
                        bookUrl:bookUrl,
                        title:title,
                        isAvailable:isAvailable
                    }
    				returnArray.push(pushObject);
    			}
            }
        }
        catch(e){
            console.log(e);
        }
        callback(returnArray)
    })
}
//console.log(url+book.bbBookURL); // https://mitt.bergenbibliotek.no/cgi-bin/m?tnr=590364
function getBookDetails(bookURL,callback){
    const bergenUrl = "https://mitt.bergenbibliotek.no";
    request(bergenUrl+bookURL, (err, res, body) => {
        if (err) { return console.log(err); }

        const window = (new JSDOM(body)).window;
        var table = window.document.getElementById('postdetaljer');
		var location = table.getElementsByTagName('div')[0].textContent;

        //location has an end line symbol as last char, so removing it
        callback(location.substring(0,location.length-1));

    })
}
