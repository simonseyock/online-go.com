/*
 * Copyright (C) 2012-2019  Online-Go.com
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/// <reference path="../typings_manual/index.d.ts" />
import "whatwg-fetch"; /* polyfills window.fetch */
import * as Sentry from '@sentry/browser';

declare var ogs_current_language;
declare var ogs_version;

let sentry_env = "production";

if (/online-(go|baduk|weiqi|covay|igo).(com|net)$/.test(document.location.host) && !(/dev/.test(document.location.host))) {
    sentry_env = "production";
    if (/beta/.test(document.location.host)) {
        sentry_env = "beta";
    }
}  else {
    sentry_env = "development";
}
    try {
        Sentry.init({
            dsn: 'https://91e6858af48a40e7954e5b7548aa2e08@sentry.io/250615',
            release: ogs_version || 'dev',
            whitelistUrls: [
                'online-go.com',
                'online-baduk.com',
                'online-weiqi.com',
                'online-covay.com',
                'online-igo.com',
                'cdn.online-go.com',
                'beta.online-go.com',
                'dev.beta.online-go.com'
            ],
            environment: sentry_env,
        });

        Sentry.setTag("version", ogs_version || 'dev');
        Sentry.setExtra("language", ogs_current_language || 'unknown');
        Sentry.setExtra("version", ogs_version || 'dev');
    } catch (e) {
        console.error(e);
    }
//}


import * as data from "data";

data.setDefault("theme", "light");
data.setDefault("config", {
    "user": {
        "anonymous": true,
        "id": 0,
        "username": "Guest",
        "ranking": -100,
        "country": "un",
        "pro": 0,
    }
});
data.setDefault("config.user", {
    "anonymous": true,
    "id": 0,
    "username": "Guest",
    "ranking": -100,
    "country": "un",
    "pro": 0,
});

import * as React from "react";
import * as ReactDOM from "react-dom";
import { browserHistory } from './ogsHistory';
import { routes } from "./routes";

//import {Promise} from "es6-promise";
import {get} from "requests";
import {errorAlerter, uuid} from "misc";
import {close_all_popovers} from "popover";
import * as sockets from "sockets";
import {_} from "translate";
import {init_tabcomplete} from "tabcomplete";
import * as player_cache from "player_cache";
import {toast} from 'toast';
import cached from 'cached';
import * as moment from 'moment';

import "debug";

declare const swal;


/*** Initialize moment in our current language ***/
declare function getPreferredLanguage();
moment.locale(getPreferredLanguage());


/*** Load our config ***/
data.watch(cached.config, (config) => {
    /* We do a pass where we set everything, and then we 'set' everything
     * again to do the emits that we are expecting. Otherwise triggers
     * that are depending on other parts of the config will fire without
     * having up to date information (in particular user / auth stuff) */
    for (let key in config) {
        data.setWithoutEmit(`config.${key}`, config[key]);
    }
    for (let key in config) {
        data.set(`config.${key}`, config[key]);
    }
});

data.watch("config.user", (user) => {
    try {
        Sentry.setUser({
            'id': user.id,
            'username': user.username,
        });
    } catch (e) {
        console.error(e);
    }

    player_cache.update(user);
    data.set("user", user);
    window["user"] = user;
});

/***
 * Setup a device UUID so we can logout other *devices* and not all other
 * tabs with our new logout-other-devices button
 */
data.set('device.uuid', data.get('device.uuid', uuid()));

/*** SweetAlert setup ***/
swal.setDefaults({
    confirmButtonClass: "primary",
    cancelButtonClass: "reject",
    buttonsStyling: false,
    reverseButtons: true,
    confirmButtonText: _("OK"),
    cancelButtonText: _("Cancel"),
    allowEscapeKey: true,
    //focusCancel: true,
});


/***
 * Test if local storage is disabled for some reason (Either because the user
 * turned it off, the browser doesn't support it, or because the user is using
 * Safari in private browsing mode which implicitly disables the feature.)
 */
try {
    localStorage.setItem('localstorage-test', "true");
} catch (e) {
    toast(
        <div>
            {_("It looks like localStorage is disabled on your browser. Unfortunately you won't be able to login without enabling it first.")}
        </div>
    );
}


/** Connect to the chat service */
let auth_connect_fn = () => {return; };
data.watch("config.user", (user) => {
    if (!user.anonymous) {
        auth_connect_fn = (): void => {
            sockets.comm_socket.send("authenticate", {
                auth: data.get("config.chat_auth"),
                player_id: user.id,
                username: user.username,
                jwt: data.get('config.user_jwt'),
            });
            sockets.comm_socket.send("chat/connect", {
                auth: data.get("config.chat_auth"),
                player_id: user.id,
                ranking: user.ranking,
                username: user.username,
                ui_class: user.ui_class,
            });
        };
    } else if (user.id < 0) {
        auth_connect_fn = (): void => {
            sockets.comm_socket.send("chat/connect", {
                player_id: user.id,
                ranking: user.ranking,
                username: user.username,
                ui_class: user.ui_class,
            });
        };
    }
    if (sockets.comm_socket.connected) {
        auth_connect_fn();
    }
});
sockets.comm_socket.on("connect", () => {auth_connect_fn(); });


/*** Generic error handling from the server ***/
sockets.termination_socket.on("ERROR", errorAlerter);


/*** Google analytics ***/
declare var gtag;


browserHistory.listen(location => {
    try {
        let cleaned_path = location.pathname.replace(/\/[0-9]+(\/.*)?/, "/ID");

        let user_type = 'error';
        let user = data.get('user');

        if (!user || user.anonymous) {
            user_type = 'anonymous';
        } else if (user.supporter) {
            user_type = 'supporter';
        } else {
            user_type = 'non-supporter';
        }

        if (gtag) {
            /* ga history hook  */
            window["gtag"]("config", 'UA-37743954-2', {
                'page_path': cleaned_path,
                'custom_map': {
                    'dimension1': user_type
                }
            });
        }

        window.document.title = "OGS";

        close_all_popovers();
    } catch (e) {
        console.log(e);
    }
});


/*** Some finial initializations ***/
init_tabcomplete();

/* Initialization done, render!! */
ReactDOM.render(routes, document.getElementById("main-content"));
