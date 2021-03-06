"use strict";
require('events').EventEmitter.defaultMaxListeners = 0;
var express = require('express');
var secure = {};
const cors = require('cors');
const fs = require("fs");
const expressStaticGzip = require('express-static-gzip');
var path = require('path');
var boom = require('express-boom-2');
var requestp = require('request-promise');
var jwt = require('jsonwebtoken');
var cookieParser = require('cookie-parser');
const multer = require("multer");
var multerS3 = require('multer-s3');
const cron = require("node-cron");
var history = require('connect-history-api-fallback');
let constants = {};
const constantsPath = path.resolve(__dirname, 'backend-private-constants.json');
const {RateLimiterRedis} = require('rate-limiter-flexible');

console.log(__dirname);

if (!process.env.DISABLE_SSL) {
  secure = require('ssl-express-www');
}

if (fs.existsSync(constantsPath)) {
  constants = require(constantsPath);
}
const AWS = require('aws-sdk');
AWS.config.update({
  region: process.env.S3_REGION || constants.S3_REGION,
  accessKeyId: process.env.S3_ACCESS_KEY || constants.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY || constants.S3_SECRET_KEY
});

const s3 = new AWS.S3();

var controller = require('./backend-controller.js');

var app = express();

const newRedis = require("redis");

const rateLimiter = new RateLimiterRedis({
  redis: controller.redisClient,
  keyPrefix: 'middleware',
  points: 100, // 10 requests
  duration: 1, // per 1 second by IP
  blockDuration: 120 // 2 minutes block
});

app.use((req, res, next) => {
  rateLimiter.consume(req.connection.remoteAddress)
    .then(() => {
      next();
    })
    .catch(() => {
      res.status(429).send('Too Many Requests');
    });
});


app.all(/^\/api-docs$/, function (req, res) {
  res.redirect('/api-docs/index.html');
});

app.use(history({
  rewrites: [
    {
      from: /^\/v1\/.*$/,
      to: function (context) {
        return context.parsedUrl.pathname;
      }
    },
    {
      from: /^\/profile-image.*$/,
      to: function (context) {
        return context.parsedUrl.pathname;
      }
    },
    {
      from: /^\/api-docs.*$/,
      to: function (context) {
        return context.parsedUrl.pathname;
      }
    }
  ]
}));

if (!process.env.DISABLE_SSL) {
  app.use(secure);
}

var compression = require('compression');

var uniqueRandomArray = require('unique-random-array');
const debug = require('debug')('pareto-ranking');
const appName = 'Pareto Ranking Backend';
debug('booting %s', appName);


/*constants*/
var sessionDebug = process.env.DEBUG || constants.DEBUG;

var bodyParser = require('body-parser');

var upload = multer({
  storage: multerS3({
    s3: s3,
    acl: 'private',
    bucket: 'pareto-images',
    metadata: function (req, file, cb) {
      cb(null, {fieldName: file.fieldname + '-' + Date.now()});
    },
    key: function (req, file, cb) {
      cb(null, 'profile-images/' + file.fieldname + '-' + Date.now())
    }
  })
});

//the key/value pairs fixes the error PayloadTooLargeError: request entity too large
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true, parameterLimit: 50000}));
app.use(cookieParser());
app.use(compression());


const corsOptions = {
  origin: 'http://localhost:8080',
  credentials: true
};
app.use(cors(corsOptions));


app.use("/api-docs", express.static('api-docs'));
app.use('/', express.static('public'));

//handles only error codes in a consistent way and format, doesn't do anything for 2XX responses
app.use(boom());

const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const ErrorHandler = require('./utils/error-handler.js');

/*app.use(session({
  store: new MongoStore(mongooseConnection: module.exports.mongoose.connection)
}));*/

//web3Auth.attach(app, "Cryptographically sign this to prove ownership.");

/*app.get('/who', function (req, res) {
  console.log(req.cookies.token);
  console.log(req.user);
  if (req.user) {
    res.json({account: req.user.loggedInAs});
  }
  else {
    res.status(404);
  }
  res.end();
});*/

app.get('/v1/listproducts', function (req, res) {
  //res.sendFile(path.join(__dirname + '/sitemap.xml'));
  controller.listProducts(function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });
});

app.get('/sitemap.xml', function (req, res) {
  res.sendFile(path.join(__dirname + '/sitemap.xml'));
});

app.get('/profile-image', function (req, res) {
  var params = {Bucket: 'pareto-images', Key: 'profile-images/' + req.query.image};
  // var url = s3.getSignedUrl('getObject', params);

  s3.getObject(params, function (err, data) {
    //res.writeHead(200, {'Content-Type': 'image/jpeg'});
    if (!err) {
      res.write(data.Body, 'binary');
      res.end(null, 'binary');
    } else {
      res.sendFile(path.join(__dirname + '/default-avatar.png'));
    }
  });
});

/********* UNAUTHENTICATED v1 APIs *********/

app.post('/v1/sign', function (req, res) {
  controller.sign(req.body, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      if (sessionDebug == 1) { //this allows you to create a cookie that works on localhost and without SSL, and can be accessed by javascript
        res.cookie('pareto_auth', result.token, {httpOnly: true});
      } else {
        res.cookie('pareto_auth', result.token, {
          domain: 'pareto.network',
          path: '/',
          httpOnly: true,
          secure: true
        }); //should set a debug flag for env variable
      }
      res.status(200).json(ErrorHandler.getSuccess({}))
    }
  });
});


app.get('/v1/rank', function (req, res) {
  var limit = parseInt(req.query.limit) || 100;
  var page = parseInt(req.query.page) || 0;

  //max limit
  if (limit > 500) {
    limit = 500;
  }
  let query = req.query.q || req.query.rank || req.query.address || req.query.score || 1;
  if (req.query.score && !isNaN(parseFloat(req.query.score))) {
    query = parseFloat(req.query.score).toFixed(3)
  }
  controller.retrieveRanksAtAddress(query, limit, page, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));

    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });

});

app.get('/v1/balance', function (req, res) {
  controller.getBalance(req.query.address, 0, function (err, count) {
    if (!err) {
      res.status(200).json(ErrorHandler.getSuccess(count));
    } else {
      res.status(200).json(ErrorHandler.getError(err));
    }
  });
});

//get info about your address
app.post('/v1/addresses', function (req, res) {
  controller.retrieveAddresses(req.body.addresses, function (err, results) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(results));
    }
  });
});


app.get('/v1/assets', function (req, res) {
  controller.getAssets(function (err, results) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(results));
    }
  });
});

app.get("/getIntels", (req, res) => {
  controller.getAllIntel((err, response) => {
    if (err) {
      res.status(502).json({message: "Could not get Intels"});
    } else {
      res.status(200).json({message: "success", data: response});
    }
  });
});

app.get("/getIntel/:id", (req, res) => {
  const {id} = req.params;
  controller.getAnIntel(id, (err, response) => {
    if (err) {
      res.status(502).json({message: "Could not get Intels"});
    } else {
      res.status(200).json({message: "success", data: response});
    }
  });
});

app.get("/getIntelsByProvider/:address", (req, res) => {
  const {address} = req.params;
  controller.getIntelsByProvider(address, (err, response) => {
    if (err) {
      res.status(502).json({message: "Could not get Intels"});
    } else {
      res.status(200).json({message: "success", data: response});
    }
  });
})

app.get("/getContributors/:intelId", (req, res) => {
  const {intelId} = req.params;
  controller.getContributorsByIntel(intelId, (err, response) => {
    if (err) {
      res.status(502).json({message: "Could not get Contributors"});
    } else {
      res.status(200).json({message: "success", data: response});
    }
  });
})

app.post('/v1/config_basic', function (req, res) {
  const netWorkId = process.env.ETH_NETWORK;
  const intel = require(netWorkId == 1 ? "../build/contracts/Intel-mainnet.json" : "../build/contracts/Intel-ropsten.json"); //1 is mainnet, 3 is ropsten
  const pcontract = process.env.CRED_PARETOCONTRACT;
  const psignversion = process.env.PARETO_SIGN_VERSION;
  const exponentBlock = process.env.EXPONENT_BLOCK_AGO;
  const showshoppingcart = process.env.SHOW_SHOPPING_CART;
  const public_key_stripe = process.env.PK_STRIPE;

  res.status(200).json(ErrorHandler.getSuccess({
    netWorkId: netWorkId,
    intelAddress: intel.networks[netWorkId].address,
    paretoAddress: pcontract,
    psignversion: psignversion,
    exponentBlock: exponentBlock,
    showshoppingcart: showshoppingcart,
    public_key_stripe: public_key_stripe
  }));
});

app.post('/v1/config', function (req, res) {
  const pareto = require("../build/contracts/ParetoNetworkToken.json");
  const netWorkId = process.env.ETH_NETWORK;
  const intel = require(netWorkId == 1 ? "../build/contracts/Intel-mainnet.json" : "../build/contracts/Intel-ropsten.json"); //1 is mainnet, 3 is ropsten
  const pcontract = process.env.CRED_PARETOCONTRACT;
  const psignversion = process.env.PARETO_SIGN_VERSION;
  const exponentBlock = process.env.EXPONENT_BLOCK_AGO;
  const showshoppingcart = process.env.SHOW_SHOPPING_CART;

  res.status(200).json(ErrorHandler.getSuccess({
    intel: intel.abi,
    pareto: pareto.abi,
    netWorkId: netWorkId,
    intelAddress: intel.networks[netWorkId].address,
    paretoAddress: pcontract,
    psignversion: psignversion,
    exponentBlock: exponentBlock,
    showshoppingcart: showshoppingcart
  }));
});


app.post('/v1/error-log', function (req, res) {
  if (req.body && req.body.errorState) {
    const error = req.body.errorState;
    error.systemMessage = req.body.error;
    if (!req.user) {
      try {
        let authorization = req.cookies.pareto_auth;
        if (authorization.includes('Bearer')) {
          authorization = authorization.replace('Bearer', '');
        }
        authorization = authorization.trim();

        jwt.verify(authorization, 'Pareto Network', function (err, decoded) {
          error.address = decoded.user;
          console.log(JSON.stringify(error));
        });
      } catch (e) {
        console.log(JSON.stringify(error));
      }
    } else {
      error.address = req.user;
      console.log(JSON.stringify(error));
    }

  }
  res.status(200).json(ErrorHandler.getSuccess({}))

});


app.post('/webhook', function (req, res) {
  // Retrieve the request's body and parse it as JSON

  controller.event_payment(req.body, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });


});

app.post('/v1/showshoppingcart', function (req, res) {

  const showshoppingcart = process.env.SHOW_SHOPPING_CART;

  res.status(200).json(ErrorHandler.getSuccess({
    showshoppingcart: showshoppingcart,
  }));
});

app.get('/v1/getproducts', function (req, res) {
  //res.sendFile(path.join(__dirname + '/sitemap.xml'));
  controller.getProducts(function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });
});

app.post('/v1/createorder', function (req, res) {

  controller.createOrder(req.body, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });
});


app.post('/v1/getOrder', function (req, res) {
  controller.getOrder(req.body.order_id, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });
});


app.post('/v1/updateTransaction', function (req, res) {

  controller.updateTransaction(req.body, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });
});

//Get the stackedGrouped chart information
app.get('/v1/stacked-grouped-information', function (req, res) {
  controller.getStackedGroupedChartInformation( function (err, results) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(results));
    }
  });
});

/********* AUTHENTICATED v1 APIs *********/

app.use(function (req, res, next) {

  if (req.cookies === undefined || req.cookies.pareto_auth === undefined) {

    res.status(200).json(ErrorHandler.tokenMissingError())

  } else {

    let authorization = req.cookies.pareto_auth;
    if (authorization.includes('Bearer')) {
      authorization = authorization.replace('Bearer', '');
    }
    authorization = authorization.trim();

    jwt.verify(authorization, 'Pareto Network', function (err, decoded) {
      if (err) {
        res.status(200).json(ErrorHandler.jwtFailedError())
      } else {
        req.user = decoded.user;
        next();
      }
    });
  }

});

/*
* Auth, simple authenticated method to determine if user is properly authenticated. Necessary because client side js
* cannot read the cookie we store for security reasons.
*/
app.get('/v1/auth', function (req, res) {

  res.status(200).json(ErrorHandler.getSuccess({auth: req.user}));
});


app.get('/v1/splash-auth', function (req, res) {
  res.sendFile(path.join(__dirname + '/public/dashboard.html'));
});

/*
* Unsign - clears cookie session for the client side, which cannot access secure httpOnly cookies
*/
app.post('/v1/unsign', function (req, res) {
  controller.unsign(function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err))
    } else {
      if (sessionDebug == 1) {
        res.cookie('pareto_auth', result.token, {httpOnly: true, maxAge: 1231006505});
      } else {
        res.cookie('pareto_auth', result.token, {
          domain: 'pareto.network',
          path: '/',
          httpOnly: true,
          secure: true,
          maxAge: 1231006505
        }); //should set a debug flag for env variable
      }
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });

});

app.post('/v1/rewardsNeeded', function (req, res) {
  controller.getRewardFromDesiredScore(req.user, req.body.desiredScore, req.body.tokens || 0, function (err, result) {
    if (err) {
      console.log(err);
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }

  });
});

app.get('/v1/summation', function (req, res) {
  res.setHeader('Content-Type', 'application/json');

  //req.user is an address
  controller.calculateScore(req.user, 0, function (err, result) {
    if (err) {
      console.log(err.message);
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }

  });

});//end entire function

app.post('/v1/intel', function (req, res) {

  if (req.body.constructor === Object && Object.keys(req.body).length === 0) {
    res.status(200).json(ErrorHandler.bodyMissingError());
  } else if (req.user === undefined || req.body.title === undefined || req.body.body === undefined) {
    res.status(200).json(ErrorHandler.contentMissingError());
  } else {

    //needs to check address whitelist against the authorized address, if people figure out the post body format.

    controller.postIntel(req, function (err, obj) {
      if (err) {
        res.status(200).json(ErrorHandler.getError(err));
      } else {
        res.status(200).json(ErrorHandler.getSuccess({status: 'success', intel: obj}));
      }

    });
  }

}); //end intel post

app.get('/v1/transaction', function (req, res) {
  controller.getTransaction(req, function (err, obj) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(obj));
    }
  });
}); //end content post


app.post('/v1/transaction', function (req, res) {
  const noParams = (!req.body.address || !req.body.intel || (!req.body.amount && req.body.event !== 'distribute') || !req.body.event || !req.body.intelAddress);
  if ((req.body.constructor === Object && Object.keys(req.body).length === 0)
    || !req.body.txHash || (noParams && (!req.body.txRewardHash && !req.body.status))) {
    res.status(200).json(ErrorHandler.bodyMissingError());
  } else {
    //needs to check address whitelist against the authorized address, if people figure out the post body format.
    controller.watchTransaction(req.body, function (err, obj) {
      if (err) {
        res.status(200).json(ErrorHandler.getError(err));
      } else {
        res.status(200).json(ErrorHandler.getSuccess({status: 'success', content: obj}));
      }

    });
  }

}); //end content post


app.get('/v1/intel', function (req, res) {
  //this needs a session id, basically an authenticated address

  var limit = parseInt(req.query.limit) || 15;
  var page = parseInt(req.query.page) || 0;

  //max limit
  if (limit > 50) {
    limit = 50;
  }

  req.query.limit = limit;
  req.query.page = page;

  controller.getAllAvailableContent(req, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });
});


app.get('/v1/intel/me', function (req, res) {
  controller.getIntelByCurrentUser(req, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });
});

//get info about another address
app.get('/v1/intel/:intel', function (req, res) {
  controller.getIntelByIntel(req, req.params.intel, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });
});


app.get('/v1/ranking', function (req, res) {
  if (req.query.admin === undefined) { //endpoint protection from DDOS
    res.boom.unauthorized();
  } else {
    //controller.seedLatestEvents(null, res);
  }
});


//Get the stackedGrouped chart information
app.get('/v1/chart-user-info', function (req, res) {
  controller.getChartUserInformation(req, function (err, results) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(results));
    }
  });
});


app.get('/v1/chart-current-balance', function (req, res) {
  controller.getNetworkCurrentBalance(req, function (err, results) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(results));
    }
  });
});

//get info about your address
app.get('/v1/address', function (req, res) {

  controller.retrieveAddress(req.user, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });

});

app.get('/v1/coinmarket-pareto', function (req, res) {
  controller.getParetoCoinMarket(function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });
});

//force update inforamtion
app.post('/v1/update', function (req, res) {
});

//get info about another address
app.get('/v1/address/:address', function (req, res) {

  controller.retrieveAddress(req.params.address, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });

});


function responseUserInfo(req, res) {
  controller.getUserInfo(req.user, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });
}

//get info of himself
app.get('/v1/userinfo', function (req, res) {
  //Get Info User
  if (req.query.latest == 'true') {
    controller.isNew(req.user, function (err, success) {
      if (success) {
        controller.updateScore(req.user, function (err, success) {
          if (err) {
            res.status(200).json(ErrorHandler.getError(err));
          } else {
            responseUserInfo(req, res);
          }
        });
      } else {
        responseUserInfo(req, res);
      }
    });
  } else {
    responseUserInfo(req, res);
  }

});

app.post('/upload-profile', upload.single('file'), function (req, res, next) {
  // req.file is the `avatar` file
  // req.body will hold the text fields, if there were any;
  controller.updateUser(req.user, {profile_pic: req.file.metadata.fieldName}, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });

});

//get info about another address
app.get('/v1/userinfo/:address', function (req, res) {
  controller.getUserInfo(req.params.address, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });

});

//update info user
app.post('/v1/updateuser', function (req, res) {
  controller.updateUser(req.user, req.body, function (err, result) {
    if (err) {
      res.status(200).json(ErrorHandler.getError(err));
    } else {
      res.status(200).json(ErrorHandler.getSuccess(result));
    }
  });
});


/*
  This should be a cron job or background process using the 2nd concurrent worker
*/

app.post('/v1/updatescores', function (req, res) {
  if (req.body.constructor === Object && Object.keys(req.body).length === 0) {
    res.status(200).json(ErrorHandler.bodyMissingError())
  } else if (req.body.admin === undefined) {
    res.status(200).json(ErrorHandler.contentMissingError())
  } else {
    controller.updateScore(req.user, function (err, result) {
      if (err) {
        res.status(200).json(ErrorHandler.getError(err));
      } else {
        res.status(200).json(ErrorHandler.getSuccess(result));
      }
    });
  }
});


app.use('/public/static/', expressStaticGzip('/public/static/', {
  customCompressions: [{
    encodingName: 'gzip',
    fileExtension: 'gz'
  }]
}));


/*app.get('/v1/intel/social', function(req, res){
  //add solume API key to config + environment variable
  //use request promises and get solume result

  //use controller to process result



}); */
/*
WEb socket in order to keep fronted updated
 */

app.initializeWebSocket = function (server) {

  const WebSocket = require('ws');
  const http = require('http');
  const wss = new WebSocket.Server({
    verifyClient: function (info, cb) {
      const data = info.req.headers.cookie.split('; ').filter(it => {
        return it.indexOf("pareto_auth=") >= 0
      });
      let token = null;
      if (data && data.length && data[0].length >= 14) {
        token = data[0].slice(14, data[0].length);
      }
      if (!token)
        cb(false, 401, 'Unauthorized');
      else {
        jwt.verify(token, 'Pareto Network', function (err, decoded) {
          if (err) {
            cb(false, 401, 'Unauthorized')
          } else {
            info.req.user = decoded;
            cb(true)
          }
        })

      }
    },
    server: server
  });

  /**
   * We need these functions in order to prevent issues with the sockets ‘alive’ status and improve performance.
   */
  function noop() {
  }

  function heartbeat() {
    this.isAlive = true;
  }

  /**
   * Initialize connections
   */
  wss.on('connection', function connection(ws, req) {
    console.log('connection');
    //prevent websocket closing from crashing the server
    ws.on('close', () => {
      console.log('close')
    })
    ws.on('error', (error) => {
      console.log(error)
    })
    ws.on('message', function incoming(message) {
      ws.info = JSON.parse(message);
    });
    ws.isAlive = true;
    ws.on('pong', heartbeat);
    ws.user = req.user;
  });
  controller.wss = wss;
  controller.WebSocket = WebSocket;
  /**
   * Validates if the connection is alive and sends info each minute,
   */
  cron.schedule("*/30 * * * * *", function () {
    try {
      wss.clients.forEach(function each(client) {
        if (client.isAlive === false) return client.terminate();

        client.isAlive = false;
        client.ping(noop);
        if (client.readyState === WebSocket.OPEN) {
          // Validate if the user is subscribed a set of information
          if (client.info && client.user) {
            const rank = parseInt(client.info.rank) || 1;
            let limit = parseInt(client.info.limit) || 100;
            const page = parseInt(client.info.page) || 0;

            //max limit
            if (limit > 500) {
              limit = 500;
            }
            /**
             * Send ranking
             */
            controller.retrieveRanksAtAddress(rank, limit, page, function (err, result) {
              if (!err) {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify(ErrorHandler.getSuccess(result)));
                }
              }
            });

            controller.retrieveAddress(client.user.user, function (err, result) {
              if (!err) {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify(ErrorHandler.getSuccess(result)));
                }
              }
            });

          }
        }
      });
    } catch (e) {
      const error = ErrorHandler.backendErrorList('b13');
      error.systemMessage = e.message ? e.message : e;
      console.log(JSON.stringify(error));
    }

  });

}

module.exports = {app: app, controller: controller};
