const Events        = require('events');
const jfHttpHeaders = require('jf-http-headers');
const httpRequest   = require('http').request;
const urlParse      = require('url').parse;
/**
 * Verifica los encabezados de la petición.
 * Usa la clase `jfHttpHeaders` para normalizar los nombres.
 *
 * @param {Object} options Opciones usadas para realizar la petición.
 */
function checkHeaders(options)
{
    if ('headers' in options)
    {
        const _headers = new jfHttpHeaders(options.headers);
        if (!_headers.get('Content-Type') && 'body' in options)
        {
            const _body = options.body;
            switch (typeof _body)
            {
                case 'string':
                    _headers.set(
                        'Content-Type',
                        _body[0] === '<'
                            ? 'text/html; charset=utf-8'
                            : 'text/plain; charset=utf-8'
                    );
                    break;
                case 'object':
                    _headers.set('Content-Type', 'application/json; charset=utf-8');
                    break;
            }
        }
        if (!_headers.get('Accept'))
        {
            const _contentType = _headers.get('Content-Type');
            if (_contentType)
            {
                _headers.set('Accept', _contentType.split(';').shift())
            }
        }
        options.headers = _headers.headers;
    }
}
/**
 * Verifica la URL de la petición.
 *
 * @param {Object} options Opciones usadas para realizar la petición.
 */
function checkUrl(options)
{
    const _url = options.url;
    if (typeof _url === 'string')
    {
        Object.assign(options, urlParse(_url));
        delete options.url;
    }
    if (options.host)
    {
        // `hostname` is preferred over `host`
        if (!options.hostname)
        {
            options.hostname = options.host;
        }
        delete options.host;
    }
    if (!options.hostname)
    {
        throw new TypeError('Wrong hostname');
    }
}
/**
 * Realiza la petición usando el módulo `http` de `NodeJS`.
 *
 * @param {Object}   options Opciones usadas para realizar la petición.
 * @param {Function} ok      Callback a ejecutar cuando termine la petición de manera exitosa.
 * @param {Function} error   Callback a ejecutar cuando ocurra un error durante la petición.
 */
function doRequest(options, ok, error)
{
    const _request = httpRequest(
        options,
        response =>
        {
            const _chunks = [];
            response.on('data', chunk => _chunks.push(chunk));
            response.on(
                'end',
                () => {
                    let _body = _chunks.join('');
                    const _contentType = new jfHttpHeaders(response.headers).get('Content-Type');
                    // application/json, application/vnd.api+json, text/json, etc.
                    if ((/[+/]json(;|$)/).test(_contentType))
                    {
                        try
                        {
                            _body = JSON.parse(_body);
                        }
                        catch (e)
                        {
                            _body = {};
                        }
                    }
                    response.body = _body;
                    ok(response)
                }
            );
        }
    );
    _request.on('error', err => error(err));
    if ('body' in options)
    {
        _request.write(options.body, 'utf8');
    }
    _request.end();
}
/**
 * Indica si la petición ha finalizado exitosamente o no.
 * Se considera una petición exitosa aquellas con códigos 2XX o 304.
 *
 * @param {http.IncomingMessage} response Respuesta recibida del servidor.
 */
function isOk(response)
{
    const _code = (response && response.statusCode) || 0;
    return (_code >= 200 && _code < 300) || _code === 304;
}
/**
 * Realiza la petición usando un callback para indicar cuando termine.
 * El callback recibirá 2 parámetros.
 *
 * El primero es el tipo de resultado:
 *
 * - request-error : Si ocurrió un error.
 * - request-fail  : Si el código HTTP devuelto no es 2XX ni 304.
 * - request-ok    : Si el código HTTP devuelto es 2XX o 304.
 *
 * El segundo parámetro es:
 *
 * - Error                : Si type === 'request-error'.
 * - http.IncomingMessage : Si type === 'request-fail' o type === 'request-ok'.
 *
 * @param {Object}   options Opciones usadas para realizar la petición.
 * @param {Function} cb      Callback a ejecutar cuando termine la petición.
 */
function typeCallback(options, cb)
{
    doRequest(
        options,
        response =>
        {
            cb(
                response,
                isOk(response)
                    ? 'request-ok'
                    : 'request-fail'
            );
        },
        error => cb(error, 'request-error')
    );
}
/**
 * Realiza la petición usando el sistema de eventos.
 * Se dispone de 3 eventos:
 *
 * - request-error : Si ocurrió un error.
 * - request-fail  : Si el código HTTP devuelto no es 2XX ni 304.
 * - request-ok    : Si el código HTTP devuelto es 2XX o 304.
 *
 * Todos reciben como parámetro la información obtenida.
 *
 * @param {Object} options Opciones usadas para realizar la petición.
 */
function typeEvents(options)
{
    const _events = new Events();
    doRequest(
        options,
        response => _events.emit(
            isOk(response)
                ? 'request-ok'
                : 'request-fail',
            response
        ),
        error => _events.emit('request-error', error)
    );
    return _events;
}
/**
 * Realiza la petición usando promesas.
 *
 * @param {Object} options Opciones usadas para realizar la petición.
 */
function typePromise(options)
{
    return new Promise(
        (resolve, reject) => doRequest(options, resolve, reject)
    );
}
/**
 * Función que encapsula el módulo `http.request` de `NodeJS`.
 * Permite realizar peticiones usando eventos, promesas o callbacks.
 *
 * @param {Object} options Opciones usadas para realizar la petición.
 *
 * @return {undefined|Events|Promise}
 */
module.exports = function jfHttpRequest(options)
{
    let _result;
    if (options)
    {
        if (typeof options === 'string')
        {
            options = {
                url : options
            };
        }
        checkUrl(options);
        checkHeaders(options);
        const _type = options.requestType;
        delete options.requestType;
        if (typeof _type === 'function')
        {
            typeCallback(options, _type);
        }
        else if (_type === 'promise')
        {
            _result = typePromise(options);
        }
        else
        {
            _result = typeEvents(options);
        }
    }
    else
    {
        throw new TypeError('Wrong options');
    }
    return _result;
};
