const assert        = require('assert');
const jfHttpRequest = require('./index');
const urls          = [
    [   0, 'http://unreachable.hostname'                     ],
    [ 200, 'http://jsonplaceholder.typicode.com/posts/1'     ],
    [ 404, 'http://jsonplaceholder.typicode.com/posts/100000']
];
//-
function check(response, statusCode)
{
    assert.deepEqual(response.statusCode, statusCode);
    if (statusCode === 200)
    {
        assert.deepEqual(
            response.body,
            {
                userId : 1,
                id     : 1,
                title  : 'sunt aut facere repellat provident occaecati excepturi optio reprehenderit',
                body   : 'quia et suscipit\nsuscipit recusandae consequuntur expedita et cum\nreprehenderit molestiae ut ut quas totam\nnostrum rerum est autem sunt rem eveniet architecto'
            }
        );
    }
}
//-
function checkError(error)
{
    const _host = urls[0][1].substr(7); // Quitamos http:// del host
    assert.deepEqual(error.message, `getaddrinfo ENOTFOUND ${_host} ${_host}:80`);
}
//-
function testCallback()
{
    urls.forEach(
        ([ code, url ]) => jfHttpRequest(
            {
                url         : url,
                requestType : (response, type) => {
                    if (type === 'request-error')
                    {
                        checkError(response);
                    }
                    else
                    {
                        check(response, code);
                    }
                }
            }
        )
    );
}
//-
function testEvent()
{
    urls.forEach(
        ([ code, url ]) => {
            jfHttpRequest(url)
                .on('request-error', error    => checkError(error))
                .on('request-fail',  response => check(response, code))
                .on('request-ok',    response => check(response, code));
        }
    );
}
//-
function testPromise()
{
    urls.forEach(
        ([ code, url ]) => {
            jfHttpRequest(
                {
                    requestType : 'promise',
                    url         : url
                }
            )
            .then(response => check(response, code))
            .catch(error => checkError(error))
        }
    );
}
//------------------------------------------------------------------------------
// Inicio de las pruebas
//------------------------------------------------------------------------------
testCallback();
testEvent();
testPromise();
