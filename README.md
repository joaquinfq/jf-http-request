# jf-http-request [![stable](http://badges.github.io/stability-badges/dist/stable.svg)](http://github.com/badges/stability-badges)

Simple wrapper for NodeJS HTTP request.

## Options

Options      |  Type  | Description
-------------|--------|--------------
auth         | string | Basic authentication i.e. `user:password` to compute an `Authorization` header.
family       | number | IP address family to use when resolving host and hostname. Valid values are 4 or 6. When unspecified, both IP v4 and v6 will be used.
headers      | object | An object containing request headers.
host         | string | A domain name or IP address of the server to issue the request to (default: `localhost`).
hostname     | string | Alias for `host`. To support `url.parse()`, `hostname` is preferred over `host`.
localAddress | string | Local interface to bind for network connections.
method       | string | A string specifying the HTTP request method (default: `GET`).
path         | string | Request path (default: `/`). Should include query string if any: `/index.html?page=12`. An exception is thrown when the request path contains illegal characters. Currently, only spaces are rejected but that may change in the future.
port         | number | Port of remote server (default: `80`).
protocol     | string | Protocol to use (default: `http:`).
socketPath   | string | Unix Domain Socket (use one of host:port or socketPath).
timeout      | number | A number specifying the socket timeout in milliseconds. This will set the timeout before the socket is connected.
body         | *      | Content to send to server (default: `undefined`).
requestType  | string | Type of result to return ('promise', 'events') or use a function for use the callback system (defaults: `events`).
url          | string | A string specifying the URL for request and passed to `url.parse`.


## Response types

There are three types of responses:

* ok    : `code >= 200 && code < 300 || code = 304`
* fail  : `code < 200 || (code >= 300 && code !== 304)`
* error : Any request error (timeout, no host, etc).

## Request types:

With parameter `type` you can change value returned (default: `events`).

### Using callbacks

```js
const jfHttpRequest = require('jf-http-request');
//...
jfHttpRequest(
    {
        url         : 'http://jsonplaceholder.typicode.com/posts/1',
        // Callback: NodeJS way
        requestType : (response, status) => {
            switch (status)
            {
                case 'request-error':
                    console.log('ERROR: %s', error.message);
                    break;
                case 'request-fail':
                    console.log('FAIL : %d', response.statusCode);
                    break;
                case 'request-ok':
                    console.log('OK   : %s', response.body);
                    break;
            }
        }
    }
)
```

### Using events

```js
const jfHttpRequest = require('jf-http-request');

// events: EDP way
jfHttpRequest('http://jsonplaceholder.typicode.com/posts/1')
    .on('request-error', error    => console.log('ERROR: %s', error.message))
    .on('request-fail',  response => console.log('FAIL : %d', response.statusCode))
    .on('request-ok',    response => console.log('OK   : %s', response.body));
```

### Using promises

```js
const jfHttpRequest = require('jf-http-request');

jfHttpRequest(
        {
            // promise: wrong way :-(
            requestType : 'promise',
            url         : 'http://jsonplaceholder.typicode.com/posts/1'
        }
    )
    .then (response => console.log(response))       // ok & fail
    .catch(error    => console.log(error.message)); // error
```
