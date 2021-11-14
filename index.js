const aws = require('aws-sdk') 


exports.handler = (event, context) => {
    let secret = event.ResourceProperties.secretName;
    let params = {
        "SecretId": secret
    };
    setupWatchdogTimer(event, context);
    if (event.RequestType === 'Create') {
      var secretsmanager = new aws.SecretsManager();
      const request = secretsmanager.getSecretValue(params, function(err, data) {
          if (err) console.log(err, err.stack); // an error occurred
          else console.log(data); // successful response
      });
      request.on('success', function(response) {
          const value = response.data.SecretString;
          sendResponse(event, context, "SUCCESS", {"secret": value});
      }).on('error', function(error, response) {
          sendResponse(event, context, "FAILED");
      });
    }
    else {
      sendResponse(event, context, "SUCCESS");
    }
}


function setupWatchdogTimer (event, context, callback) {
  const timeoutHandler = () => {
    console.log('Timeout FAILURE!')
    // Emit event to 'sendResponse', then callback with an error from this
    // function
    new Promise(() => sendResponse(event, context, 'FAILED'))
      .then(() => callback(new Error('Function timed out')))
  }

  // Set timer so it triggers one second before this function would timeout
  setTimeout(timeoutHandler, context.getRemainingTimeInMillis() - 1000)
}

// Send response to the pre-signed S3 URL
function sendResponse (event, context, responseStatus, responseData) {
  console.log('Sending response ' + responseStatus)
  var responseBody = JSON.stringify({
    Status: responseStatus,
    Reason: 'See the details in CloudWatch Log Stream: ' + context.logStreamName,
    PhysicalResourceId: context.logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: responseData
  })

  console.log('RESPONSE BODY:\n', responseBody)

  var https = require('https')
  var url = require('url')

  var parsedUrl = url.parse(event.ResponseURL)
  var options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: 'PUT',
    headers: {
      'content-type': '',
      'content-length': responseBody.length
    }
  }

  console.log('SENDING RESPONSE...\n')

  var request = https.request(options, function (response) {
    console.log('STATUS: ' + response.statusCode)
    console.log('HEADERS: ' + JSON.stringify(response.headers))
    // Tell AWS Lambda that the function execution is done
    context.done()
  })

  request.on('error', function (error) {
    console.log('sendResponse Error:' + error)
    // Tell AWS Lambda that the function execution is done
    context.done()
  })

  // write data to request body
  request.write(responseBody)
  request.end()
}
