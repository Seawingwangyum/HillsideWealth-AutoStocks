/*** Node Modules ***/
require("dotenv").config();
const express = require("express");
const request = require("request");
const hbs = require("hbs");
const bodyParser = require("body-parser");
const session = require("client-sessions");
const app = express();
const multer = require('multer');
const upload = multer({ dest: './uploads/' });
const fs = require("fs");
const _ = require("lodash");

hbs.registerHelper('json', function (context) {
    return JSON.stringify(context);
});

/*** Project Scripts ***/
const api_calls = require("./actions/api_calls");
const auth = require("./actions/auth");
const xlsx_parse = require("./actions/xlsx_parse");
const db = require("./actions/database");
const calc = require('./actions/calculations');

const { format_data, formatHistorical } = require('./actions/formatData');

/*** Constants ***/
const port = process.env.PORT || 8080;

/*** Middlewares ***/

app.set("view engine", "hbs");
app.use(express.static(`${__dirname}/public`));
hbs.registerPartials(`${__dirname}/views/partials`);

/* Bodyparser Middlewares */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

/* Session Middleware */
app.use(
    session({
        cookieName: "session",
        secret: process.env.SESSION_SECRET,
        duration: 3154000000000
    })
);

/* Checks session */
const sessionCheck = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect("/login");
    }
};

const statusCheck = (req, res, next) => {
    if (req.session.status) {
        next();
    } else {
        res.redirect("/entercode");
    }
};

const tableDict = {
    high: 'high_conviction',
    low: 'low_conviction',
    owned: 'owned'
}


/*** HTTP Requests ***/

/** GET **/

app.get("/", sessionCheck, statusCheck, (request, response) => {
    response.render("index.hbs", { i: true, admin: (request.session.status == 'admin'), user: request.session.user });
});

app.get("/register", (request, response) => {
    response.render("register.hbs");
});

app.get("/login", (request, response) => {
    response.render("login.hbs");
});

app.get("/indicators", (request, response) => {
    response.render("indicators.hbs", {
        in: true,
        admin: (request.session.status == 'admin'),
        user: request.session.user
    });
});

app.get("/collection", sessionCheck, statusCheck, (request, response) => {
    response.render("collection.hbs", {
        c: true,
        admin: (request.session.status == 'admin'),
        user: request.session.user,
        config: {
            action: 'init_user',
            addLink: '/append',
            removeLink: '/remove?table=all',
            updateLink: 'update_financials?table=all',
            shareConf: false,
            customLink: '/custom?table=all',
            initTable: '/init_table'
        }
    });
});

app.get("/shared", sessionCheck, statusCheck, (request, response) => {
    response.render("collection.hbs", {
        user: request.session.user,
        sc: true,
        admin: (request.session.status == 'admin'),
        user: request.session.user,
        config: {
            action: 'init_shared',
            addLink: '/append?share=true',
            removeLink: '/remove?table=shared',
            updateLink: 'update_financials?table=shared',
            shareConf: true,
            customLink: '/custom?table=shared',
            initTable: '/init_table'
        }
    })
});

app.get("/special", sessionCheck, statusCheck, (request, response) => {
    db.showSpecial(request.session.user)
        .then(res => {
            // Calculates data before rendering
            res.forEach((stock) => {
                format_data(stock);
            });
            response.render("collection.hbs", {
                sd: true,
                admin: (request.session.status == 'admin'),
                user: request.session.user,
                config: {
                    action: 'init_special',
                    addLink: '/append?special=true',
                    removeLink: '/remove?table=special',
                    updateLink: 'update_financials?table=all',
                    shareConf: false,
                    customLink: '/custom?table=special',
                    initTable: '/init_table'
                }
            });
        });
});

app.get("/other", sessionCheck, statusCheck, (request, response) => {
    response.render("collection.hbs", {
        o: true,
        admin: (request.session.status == 'admin'),
        user: request.session.user,
        config:{
            action: 'init_other',
            addLink: '/append',
            removeLink: `/remove?table=${tableDict[request.query.table]}`,
            updateLink: `update_financials?table=all`,
            shareConf: false,
            customLink: `/custom?table=${request.query.table}`,
            initTable: `/init_other?table=${request.query.table}`
        }
    });
});

app.get('/custom', sessionCheck, async (request, response) => {
    let test = {
        cu: true,
        admin: (request.session.status == 'admin'),
        user: request.session.user,
        config: {
            link: request.query.table,
            tableType: request.query.table.toUpperCase()
        }
    }
    test[`${request.query.table}`] = true;
    response.render("collection2.hbs", test);
})

app.get("/edit", (request, response) => {
    response.render("edit.hbs", {
        in: true,
        admin: (request.session.status == 'admin'),
        user: request.session.user
    });
});

app.get("/documentation", sessionCheck, statusCheck, (request, response) => {
    response.render("documentation.hbs", { d: true, admin: (request.session.status == 'admin'), user: request.session.user });
});

app.get("/settings", sessionCheck, statusCheck, (request, response) => {
    response.render("settings.hbs", { s: true, admin: (request.session.status == 'admin'), user: request.session.user });
});

/* Account validation page */
app.get('/entercode', sessionCheck, (request, response) => {
    response.render("entercode", { user: request.session.user });
});

app.get('/admin', sessionCheck, (request, response) => {
    if (request.session.status != 'admin') {
        response.redirect('/');
    } else {
        admin = true;
        db.retrieveCodes().then((r) => {
            let codes = r.rows;
            console.log(codes);
            response.render('admin.hbs', { codes: codes, a: true });
        });
    }
});

app.get('/historic', sessionCheck, async (request, response) => {
    try {
        let stockdata = await db.get_by_id(request.query.id);
        let tableconfig = await db.getTableConfig(request.session.user, 'historic');
        let formattedData = await formatHistorical(stockdata, tableconfig.rows[0].config_string);
        response.send({
            data: formattedData,
            test: tableconfig.rows[0].config_string,
            id: tableconfig.rows[0].id,
            name: tableconfig.rows[0].name,
            fallback: tableconfig.rows[0].fallback
        })
    }
    catch (e) {
        console.log(e)
        response.send({ error: true })
    }

});

app.get('/comments', sessionCheck, async (request, response) => {
    let formattedData = {};
    let comments = (await db.comments({ action: "get", id: request.query.id })).rows[0];
    for (let key in comments) {
        formattedData[key] = JSON.parse(comments[key] === '' ? null : comments[key])
    }
    response.send(formattedData)
})

app.get('/dcf', sessionCheck, async (request, response) => {
    let stock = await db.get_by_id(request.query.id);
    format_data(stock[0])
    response.send(stock[0])
})

/** POST **/

app.post('/editNote', sessionCheck, (request, response) => {
    db.editNote(request.body.note, request.session.user, request.body.stock_id)
        .then(() => response.send(true))
        .catch(() => response.send(false));
});

/* New Code */
app.post("/newCode", sessionCheck, (request, response) => {
    console.log(request.body);
    db.changeCode(request.body.newCode, request.body.code_id)
        .then((r) => {
            response.send(request.body);
        });
});


/* Enter Code */
app.post("/entercode", sessionCheck, (request, response) => {
    auth.validateCode(request.body.code)
        .then((r) => {
            db.changeStatus(request.session.user, r.trim())
                .then(() => {
                    request.session.status = r.trim();
                    console.log(r);
                    response.redirect('/');
                });
        })
        .catch((err) => {
            console.log(err);
            response.render("entercode", {
                user: request.session.user,
                error: err
            });
        });
});

/* Login */
app.post("/login", (request, response) => {
    auth.login(request.body.username, request.body.password)
        .then((r) => {
            request.session.user = r.username;
            if (r.status) { request.session.status = r.status.trim(); }
            response.send(JSON.stringify({ 'status': 'authorized' }));

        })
        .catch(err => {
            response.send(JSON.stringify({ 'status': err }));
        });
});

/* Register */
app.post("/register", (request, response) => {
    auth.signup(
        request.body.username,
        request.body.password,
        request.body.confirmPassword
    ).then(() => {
        request.session.user = request.body.username;
        request.session.status = null;
        response.send(JSON.stringify({ 'status': 'authorized' }));
    }).catch((err) => {
        response.send(JSON.stringify({ 'status': err }));
    });
});

/* File Upload */
app.post('/upload', upload.single('myfile'), sessionCheck, statusCheck, (request, response) => {
    if ("action" in request.body != true) {
        var xlsxdata;
        xlsx_parse.xlsxjson(`./uploads/${request.file.filename}`).then((resolved) => {
            xlsxdata = JSON.parse(resolved);
            db.showstocks(request.session.user).then((resolved2) => {
                let dbdata = resolved2;
                for (i = 0; i < dbdata.length; i++) {
                    _.remove(xlsxdata, function (e) {
                        return true == dbdata[i].symbol.includes(e.Symbol);
                    });
                }
                response.render('compare.hbs', { data: xlsxdata, dbdata: dbdata, i: true, admin: (request.session.status == 'admin') });
            }).catch(err => {
                console.error(err);
            });
        }).catch(err => {
            console.error(err);
        });
    }
    else {
        switch (request.body.action) {
            case 'Append':
                api_calls.gurufocusAdd(request.body.stocks, request.session.user)
                    .then((resolve) => {
                        response.send(JSON.stringify({ stocks: resolve, action: 'Append' }));
                    })
                    .catch((reason) => console.log(reason));
                break;

            case 'Remove':
                let promises = [];
                for (let i = 0; i < request.body.stocks.length; i++) {
                    promises.push(db.removeStocks(request.body.stocks[i].symbol, request.session.user));
                }
                Promise.all(promises)
                    .then((returned) => {
                        response.send(JSON.stringify(request.body));
                    });
                break;
        }
    }

});

app.post('/indicators/get', sessionCheck, statusCheck, (request, response) => {
    // console.log(request.body)
    db.get_indicators(request.session.user).then(resolve => {
        response.send(resolve.rows);
    });
});

app.post('/indicators/append', sessionCheck, statusCheck, (request, response) => {
    db.addIndicators(request.session.user, request.body).then(res => {
        response.send(res.rows);
    });
});

app.post('/indicators/edit', sessionCheck, statusCheck, (request, response) => {
    db.editIndicators(request.body).then(res => {
        response.send(res.rows);
    });
});

app.post('/indicators/delete', sessionCheck, statusCheck, (request, response) => {
    db.deleteIndicator(request.body);
    response.send({ test: 'hello' });
});

//Initializes Tables
app.post('/init_table', sessionCheck, statusCheck, async (request, response) => {
    if (request.body.action == "init_user") {
        db.showstocks(request.session.user).then(resolve => {
            resolve.forEach((stock) => {
                format_data(stock);
            });
            response.send({ data: resolve });
        });
    }
    else if (request.body.action == "init_shared") {
        db.showshared(request.session.user).then(resolve => {
            resolve.forEach((stock) => {
                format_data(stock);
            });
            response.send({ data: resolve });
        });
    }
    else if (request.body.action == "init_special") {
        db.showSpecial(request.session.user).then(resolve => {
            resolve.forEach((stock) => {
                format_data(stock);
            });
            response.send({ data: resolve });
        });
    }
    else if (request.body.action == "init_custom") {
        let toSend = [];
        let stocks;
        console.log(request.query)
        if (request.query.table === "all") {
            stocks = await db.showstocks(request.session.user);
        }
        else if (request.query.table === "shared") {
                stocks = await db.showshared(request.session.user);
            }
        else if (request.query.table === "special") {
            stocks = await db.showSpecial(request.session.user);
        }
        else {
            stocks = await db.showOther(request.session.user, tableDict[request.query.table])
        }
        let tableconfig = await db.getTableConfig(request.session.user, 'custom');
        if (tableconfig.rows.length !== 0) {
            stocks.forEach(stock => {
                toSend.push({
                    stock_id: stock.stock_id,
                    stock_name: stock.stock_name,
                    symbol: stock.symbol,
                    stock_data: formatHistorical([stock], tableconfig.rows[0].config_string, 1)[0]
                })
            });
            response.send({
                data: toSend,
                config_string: tableconfig.rows[0].config_string,
                id: tableconfig.rows[0].id,
                name: tableconfig.rows[0].name,
                fallback: tableconfig.rows[0].fallback
            });
        }
        else {
            response.send({ error: "no config selected", data: [] })
        }
    }
});

app.post('/init_other', sessionCheck, statusCheck, async(request, response) => {
    console.log(request.query.table);
    let option = tableDict[request.query.table];
    db.showOther(request.session.user, option).then((resolve) => {
        resolve.forEach((stock) => {
            format_data(stock)
        });
        response.send({data: resolve})
    })
})

app.post('/tableconfig', sessionCheck, statusCheck, async (request, response) => {
    console.log(request.body)
    switch (request.body.action) {
        case "edit":
            console.log(request.body)
            db.customTableSettings({
                configString: request.body.configString,
                name: request.body.configName,
                id: request.body.id
            }, "edit")
            response.send({ status: "ok" })
            break;
        case "add":
            console.log(request.body)
            db.customTableSettings({
                username: request.session.user,
                table: request.body.table,
                configString: request.body.configString.replace('\n', ''),
                configName: request.body.configName
            }, request.body.action)
            response.send({ status: "ok" })
            break;
        case "getConfigs":
            let configList = await db.customTableSettings({ username: request.session.user }, "getConfigs");
            let formatted = {};
            configList.rows.forEach(val => formatted[val.id] = val.name === null || val.name === "" ? "No Name" : val.name)
            response.send(formatted)
            break;
        case "switchCustom":
            console.log(request.body)
            await db.customTableSettings({ username: request.session.user, id: request.body.id }, "switchCustom");
            response.send({ success: true })
            break;
        case "switchHistoric":
            console.log(request.body)
            await db.customTableSettings({ username: request.session.user, id: request.body.id }, "switchHistorical");
            response.send({ success: true })
            break;
        case "delete":
            console.log(request.body)
            await db.customTableSettings({ id: request.body.id }, "delete");
            response.send({ success: true })
            break;

        default:
            break;
    }
})

/* Edit Fields */
app.post('/edits', sessionCheck, statusCheck, (request, response) => {
    console.log(request.body)
    db.edits(request.body).then(() => {
        db.get_by_id(request.body.id).then((res) => {
            res.forEach((stock) => {
                format_data(stock);
            });
            response.send({ data: res });
        });
    });
});

/* DFC Values Edit */
app.post('/calc_edit', sessionCheck, statusCheck, (request, response) => {
    db.dfc_edits(request.body.values, calc.multi_dfc_string(request.body.stock_id_list)).then((resolve) => {
        response.send("OK");
    });
});

/* Adds Stock to Personal Database */
app.post('/append', sessionCheck, statusCheck, (request, response) => {
    console.log(request.query)
    let { shared, special, high, low, owned } = request.query;
    api_calls.gurufocusAdd(
        request.body.action,
        request.session.user,
        true,
        shared,
        special,
        high,
        low,
        owned
    )
        .then((resolve) => {
            db.get_added(request.body.action[0].symbol, request.session.user)
                .then((res) => {
                    res.forEach((stock) => {
                        format_data(stock);
                    });
                    //fs.writeFileSync('test.json', JSON.stringify(res))
                    response.send({ data: res });
                });
        })
        .catch((reason) => {
            response.send({ error: reason })
            console.log(reason)
        });
});

/* removes stocks from the database */
app.post('/remove', sessionCheck, statusCheck, (request, response) => {
    let query = request.query.table
    let promises = [];
    for (let i = 0; i < request.body.action.length; i++) {
        if (query === 'all') {
            promises.push(db.removeStocks(request.body.action[i], request.session.user));
        }
        else {
            promises.push(db.unSaveStock(query, request.body.action[i], request.session.user))
        }
    }
    Promise.all(promises)
        .then((returned) => {
            response.send({ status: 'OK' });
        });
});

app.post('/save', sessionCheck, statusCheck, (request, response ) => {
    db.saveStock(calc.multi_dfc_string(request.body), request.query.dest)
    .then((resolve) => {
        response.send({test: 'hi there'})
    })
})

/* Updates Historical Financial Data */
app.post('/update_financials', sessionCheck, statusCheck, (request, response) => {
    console.log(request.body)
    console.log(request.session.user)
    switch (request.query.table) {
        case 'all':
            api_calls.gurufocusAdd(request.body.action, request.session.user, summaryCall = true, request.session.shared, request.session.special)
                .then((r) => {
                    db.get_added(request.body.action[0].symbol, request.session.user)
                        .then((res) => {
                            res.forEach((stock) => { format_data(stock); });
                            response.send({ data: res });
                        });
                });
            break;
        case 'shared':
            api_calls.gurufocusAdd(request.body.action, request.body.action[0].stock_id, summaryCall = true, request.session.shared, request.session.special)
                .then((r) => {
                    db.get_added(request.body.action[0].symbol, request.body.action[0].stock_id)
                        .then((res) => {
                            res.forEach((stock) => { format_data(stock); });
                            response.send({ data: res });
                        });
                });
            break;

        default:
            console.log("error")
    }
});

/* Sets Catagorie Strings for stocks */
app.post('/categories/set', sessionCheck, statusCheck, (request, response) => {
    let combined_string = calc.multi_dfc_string(request.body.stocks_list);
    let retrieve_info = [];
    db.set_categories(request.body.categories, combined_string)
        .then((resolve) => {
            // console.log(resolve);
            for (let i in request.body.stocks_list) {
                retrieve_info.push(db.get_added(request.body.symbols[i], request.session.user));
            }
            Promise.all(retrieve_info).then((resolved) => {
                for (let i in resolved) {
                    resolved[i].forEach((stock) => { format_data(stock); });
                }
                response.send(JSON.stringify(resolved));
            });
        });
});

app.post('/aggregation', sessionCheck, statusCheck, (request, response) => {
    console.log(request.query.action);
    switch (request.query.action) {
        case "create":
            db.createAggregation(request.session.user, calc.createAggregationString(request.body.columns), request.body.name).then(resolve => {
                response.send({ hello: 'hello' });
            });
            break;
        case "get":
            db.retrieveAggregates(request.session.user).then(resolve => {
                response.send(resolve.rows);
            });
            break;
        case "aggregate":
            let track = [];
            let symbols = [];
            for (let i in request.body) {
                if (request.body[i].row.split(' !').length != 1) {
                    trackPositions(track, symbols, sorter(request.body[i].values).reverse());
                }
                else {
                    trackPositions(track, symbols, sorter(request.body[i].values));

                }

            }
            response.send(JSON.stringify({ symbols: symbols, score: track }));

            function sorter(arrayList) {
                arrayList.sort(function (a, b) { return a.value - b.value; });
                return arrayList;
            }

            function trackPositions(tracker, symbolList, arrayList) {
                for (let i in arrayList) {
                    // console.log(arrayList[i])
                    if (symbolList.indexOf(arrayList[i].symbol) == -1) {
                        symbolList.push(arrayList[i].symbol);
                        tracker.push(parseInt(i) + 1);
                    }
                    else {
                        let pos = symbolList.indexOf(arrayList[i].symbol);
                        tracker[pos] += parseInt(i) + 1;
                    }
                }
            }
            break;
        case "get_single":
            db.getAggregateSingle(request.body.aggregationString, request.session.user).then(resolve => {
                response.send(resolve.rows);
            });
            break;
        case "edit":
            db.editAggregate(request.session.user, calc.createAggregationString(request.body.columns), request.body.name).then(resolve => {
                response.send(resolve.rows);
            });
            break;
        case "delete":
            db.deleteAggregate(request.body.delete).then(resolve => {
                response.send({ success: resolve });
            });
            break;
        default:
            console.log("error")
            break;
    }
})

app.post('/comments', sessionCheck, statusCheck, async (request, response) => {
    await db.comments(request.body)
    response.send({ status: "ok" })
})

/* Logout */
app.post("/logout", (request, response) => {
    request.session.reset();
    response.redirect("/");
});

/*** Start Server ***/
app.listen(port, () => {
    console.log(`Server is up on port: ${port}, with PID: ${process.pid}`);
});