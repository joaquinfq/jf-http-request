const crypto        = require('crypto');
const Events        = require('events');
const fs            = require('fs');
const urlParse      = require('url').parse;
const jfHttpHeaders = require('jf-http-headers');
const http          = require('http');
const HttpMessage   = http.IncomingMessage;
const httpRequest   = http.request;
const httpsRequest  = require('https').request;
/**
 * Caché de peticiones realizadas.
 *
 * @type {Object}
 */
const cache         = {};
/**
 * Tiempo por defecto de la caché.
 *
 * @type {Number}
 */
let cacheTime       = 0;
/**
 * Propiedades de la respuesta que se serializarán.
 *
 * @type {String[]}
 */
const properties    = [
    'body',
    'headers',
    'httpVersion',
    'httpVersionMajor',
    'httpVersionMinor',
    'method',
    'rawHeaders',
    'rawTrailers',
    'statusCode',
    'statusMessage',
    'trailers',
    'url'
];
/**
 * Agrega al cache una respuesta obtenida del servidor.
 *
 * @param {String} hash     Hash a usar como clave del cache.
 * @param {Number} time     Tiempo de duración en caché de los datos.
 * @param {*}      response Respuesta a almacenar en caché.
 */
function addToCache(hash, time, response)
{
    purgeCache();
    // Serializamos la respuesta para evitar referencias circulares y para crear una copia.
    const _serialized = {};
    properties.forEach(name => _serialized[name] = response[name]);
    cache[hash] = {
        data : _serialized,
        time : new Date().getTime() + time
    };
}
/**
 * Crea un hash a usar como clave del caché a partir del contenido especificado.
 *
 * @param {String} content Contenido a usar para generar el caché.
 *
 * @return {String} Hash del contenido.
 */
function buildHash(content)
{
    return crypto.createHash('sha256').update(content).digest('hex');
}
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
    let _url = options.url;
    if (typeof _url === 'string')
    {
        _url = urlParse(_url);
        if (options.pathname)
        {
            _url.path = options.pathname;
            delete options.pathname;
        }
        else if (_url.query)
        {
            _url.path += '?' + _url.query;
        }
        Object.assign(options, _url);
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
    const _cacheTime = 'cacheTime' in options
        ? options.cacheTime
        : cacheTime;
    let _hash;
    let _response;
    if (_cacheTime)
    {
        _hash     = buildHash(JSON.stringify(options));
        _response = fromCache(_hash);
    }
    if (_response)
    {
        ok(_response);
    }
    else
    {
        const _httpRequest = options.protocol === 'https:'
            ? httpsRequest
            : httpRequest;
        const _request     = _httpRequest(
            options,
            response =>
            {
                const _chunks = [];
                response.on('data', chunk => _chunks.push(chunk));
                response.on(
                    'end',
                    () =>
                    {
                        let _body          = Buffer.concat(_chunks);
                        const _contentType = new jfHttpHeaders(response.headers).get('Content-Type');
                        // application/json, application/vnd.api+json, text/json, etc.
                        if ((/[+/]json(;|$)/).test(_contentType))
                        {
                            try
                            {
                                _body = JSON.parse('' + _body);
                            }
                            catch (e)
                            {
                                _body = {};
                            }
                        }
                        response.body = _body;
                        if (_hash)
                        {
                            addToCache(_hash, _cacheTime, response);
                        }
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
}
/**
 * Obtiene del caché una respuesta previamente almacenada.
 * Purga las respuestas caducadas.
 *
 * @param {String} hash Hash a usar como clave del cache.
 *
 * @return {http.IncomingMessage|undefined} Respuesta del caché o `undefined` si no existe.
 */
function fromCache(hash)
{
    let _response;
    purgeCache();
    const _data = cache[hash];
    if (_data)
    {
        const _values = _data.data;
        _response     = new HttpMessage();
        properties.forEach(name => _response[name] = _values[name]);
    }
    return _response;
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
 * Verifica si la clase especificada implementa los métodos usados en las promesas.
 *
 * @param {Class} Class Referencia de la clase.
 */
function isPromise(Class)
{
    return typeof Class                 === 'function' &&
           typeof Class.prototype       === 'object' &&
           typeof Class.prototype.catch === 'function' &&
           typeof Class.prototype.then  === 'function';
}
/**
 * Purga el contenido caducado del caché.
 */
function purgeCache()
{
    const _current = new Date().getTime();
    Object.keys(cache).forEach(
        key =>
        {
            if (cache[key].time < _current)
            {
                delete cache[key];
            }
        }
    );
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
 * @param {Class}  Promise Clase que implementa la especificación de promesas establecida en
 *                         la sección 25.4 de EcmaScript 6.
 * @param {Object} options Opciones usadas para realizar la petición.
 */
function typePromise(Promise, options)
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
            if (isPromise(_type))
            {
                _result = typePromise(_type, options);
            }
            else
            {
                typeCallback(options, _type);
            }
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
module.exports.cache = cache;
/**
 * Carga el caché desde un archivo.
 *
 * @param {String} file Ruta del archivo del caché.
 */
module.exports.loadCache = file =>
{
    if (fs.existsSync(file))
    {
        Object.assign(cache, require(file));
    }
};
/**
 * Asigna el tiempo de duración de los datos en caché.
 *
 * @param {Number} time Tiempo a asignar.
 */
module.exports.setCacheTime = time => cacheTime = time;
/**
 * Carga el caché desde un archivo.
 *
 * @param {String} file Ruta del archivo del caché.
 */
module.exports.writeCache = file => fs.writeFileSync(file, JSON.stringify(cache), 'utf8');
