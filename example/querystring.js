const querystring = require('querystring');

const str = querystring.stringify({
    // ...params.conditions,
    action: 'searchTransactionByConditions',
    seller: 'seller',
    confirmationNumber: 'confirmationNumber',
    telephone: 'telephone'
});
console.log(str);
