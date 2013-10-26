/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2013 Vladimir Fesko
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
var DbProxy = {
  //
  // Database Id
  //
  DATABASE_ID: "<DATABASE_ID>"
};

(function(DbProxy) {
  //
  // Database URL
  //
  DbProxy.DATABASE_URL = "https://api.appery.io/rest/1/db";

  //
  // Users path
  //
  DbProxy.USERS_PATH = "/users";

  //
  // JSON content type
  //
  DbProxy.CONTENT_TYPE_JSON = "application/json";

  //
  // Paths for which session token can be omitted
  //
  DbProxy.ALLOW_NO_SESSION_TOKEN_PATHS = ["/login"];

  //
  // Incoming request URL keys
  //
  DbProxy.URL_KEYS = {
    sessionToken: "X-Appery-Session-Token",
    path        : "X-Appery-Request-Path",
    method      : "X-Appery-Request-Method"
  };

  //
  // Request URL keys to exclude while forwarding
  //
  DbProxy.EXCLUDE_KEYS = [
    DbProxy.URL_KEYS.sessionToken,
    DbProxy.URL_KEYS.path,
    DbProxy.URL_KEYS.method];

  //
  // Headers to sent while forwarding request
  //
  DbProxy.HEADERS = {
    databaseId  : "X-Appery-Database-Id",
    sessionToken: "X-Appery-Session-Token",
    contentType : "Content-Type"
  };

  //
  // Error message text: authorization required
  //
  DbProxy.ERR_MSG_AUTHORIZE = "Session token missing or invalid, please authourize yourself.";

  //
  // Error message text: bad request
  //
  DbProxy.ERR_MSG_BAD_REQUEST = "Bad request.";

  //
  // Session token
  //
  DbProxy.sessionToken = false;

  //
  // User id associated with session token
  //
  DbProxy.userId = false;

  //
  // Forward request method
  //
  DbProxy.forwardRequestMethod = false;

  //
  // Forwards request to database if pre-requisites are met
  // Generates error otherwise
  //
  DbProxy.forwardRequest = function() {
    if (!DbProxy.isForwardingPathProvided()) {
      DbProxy.errorBadRequest();
      return;
    }

    if (DbProxy.isSignupRequest()) {
      DbProxy.handleSignupRequest();
      return;
    }

    if (!DbProxy.isContentTypeValid()) {
      DbProxy.errorBadRequest();
      return;
    }

    if (DbProxy.isSessionTokenRequired() && !DbProxy.isSessionTokenValid()) {
      DbProxy.errorAuthorize();
      return;
    }

    var rqOptions = DbProxy.getCommonRequestOptions();
    if (DbProxy.isSessionTokenRequired()) {
      DbProxy.addSessionTokenToRequestOptions(rqOptions);
    }

    if (!DbProxy.isRequestGet()) {
      if (DbProxy.isRequestPost()) {
        DbProxy.replaceAclWithPersonal(rqOptions);
      } else {
        DbProxy.removeAclFromRequestOptions(rqOptions);
      }
    }

    var forwardUrl = DbProxy.DATABASE_URL + DbProxy.getPathValue();
    var forwardResponse = XHR.send(
      DbProxy.getForwardRequestMethod(),
      forwardUrl,
      rqOptions);

    if (DbProxy.isResponseCodeSuccessful(forwardResponse.status)) {
      response.success(forwardResponse.body);
    } else {
      response.error(forwardResponse.body, forwardResponse.status);
    }
  };

  //
  // Checks if forwarding path is provided
  //
  DbProxy.isForwardingPathProvided = function() {
    return !DbProxy.isRequestParamEmpty(DbProxy.URL_KEYS.path);
  };

  //
  // Checks if request param is empty
  //
  DbProxy.isRequestParamEmpty = function(paramName) {
    return !request.has(paramName) || request.get(paramName).length == 0;
  };

  //
  // Generates bad request error
  //
  DbProxy.errorBadRequest = function() {
    response.error(DbProxy.ERR_MSG_BAD_REQUEST, 400);
  };

  //
  // Checks if request is signup
  //
  DbProxy.isSignupRequest = function() {
    return DbProxy.isRequestPost() && DbProxy.getPathValue() == DbProxy.USERS_PATH && !DbProxy.isSessionTokenProvided();
  };

  //
  // Checks if request is POST
  //
  DbProxy.isRequestPost = function() {
    return DbProxy.isRequestMethodMatchesString("POST");
  };

  //
  // Checks if request method matches string
  //
  DbProxy.isRequestMethodMatchesString = function(method) {
    return request.method.toLowerCase() == method.toLowerCase();
  };

  //
  // Handles signup request
  //
  DbProxy.handleSignupRequest = function() {
    var rqOptions = DbProxy.getCommonRequestOptions();
    rqOptions = DbProxy.removeAclFromRequestOptions(rqOptions);

    var signupResponse = XHR.send(
      "POST",
      DbProxy.DATABASE_URL + DbProxy.getPathValue(),
      rqOptions);

    // Generate response according to actual response code
    // Update user ACL to be RW only for the user itself
    if (DbProxy.isResponseCodeSuccessful(signupResponse.status)) {
      DbProxy.updateUserAclToPersonal(signupResponse.body._id, signupResponse.body.sessionToken);
      response.success(signupResponse.body);
    } else {
      response.error(signupResponse.body, signupResponse.status);
    }
  };

  //
  // Retunrs XHR request common options
  //
  DbProxy.getCommonRequestOptions = function() {
    var rqOptions = {
      headers: {}
    };
    rqOptions.headers[DbProxy.HEADERS.databaseId] = DbProxy.DATABASE_ID;

    if (!DbProxy.isRequestGet()) {
      rqOptions.body = JSON.parse(request.body());
      rqOptions.headers[DbProxy.HEADERS.contentType] = request.mimeType();
    }

    // Add request parameters excluding proxy-specific
    var requestParamKeys = request.keys();
    for (var key = 0; key < requestParamKeys.length; key++) {
      if (DbProxy.EXCLUDE_KEYS.contains(requestParamKeys[key])) {
        continue;
      }
      rqOptions.parameters = rqOptions.parameters || {};
      rqOptions.parameters[requestParamKeys[key]] = encodeURIComponent(request.get(requestParamKeys[key]));
    }
    return rqOptions;
  };

  //
  // Checks if request is GET
  //
  DbProxy.isRequestGet = function() {
    return DbProxy.isRequestMethodMatchesString("GET");
  };

  //
  // Removes ACL from request options
  //
  DbProxy.removeAclFromRequestOptions = function(rqOptions) {
    if ("body" in rqOptions && "acl" in rqOptions.body) {
      delete rqOptions.body.acl;
    }
    return rqOptions;
  };

  //
  // Returns path value
  //
  DbProxy.getPathValue = function() {
    return request.get(DbProxy.URL_KEYS.path);
  };

  //
  // Checks if response code is successful
  //
  DbProxy.isResponseCodeSuccessful = function(code) {
    return code >= 200 && code < 300;
  };

  //
  // Updates user ACL to personal
  //
  DbProxy.updateUserAclToPersonal = function(userId, sessionToken) {
    var body = {};
    body["acl"] = DbProxy.getUserPersonalAcl(userId);
    var rqOptions = {
      headers: {},
      body: body
    };
    rqOptions.headers[DbProxy.HEADERS.databaseId] = DbProxy.DATABASE_ID;
    rqOptions.headers[DbProxy.HEADERS.sessionToken] = sessionToken;
    rqOptions.headers[DbProxy.HEADERS.contentType] = DbProxy.CONTENT_TYPE_JSON;

    // Update user's ACL
    var updateUserUrl = DbProxy.DATABASE_URL + DbProxy.USERS_PATH + "/" + userId;
    XHR.send("PUT", updateUserUrl, rqOptions);
  };

  //
  // Returns personal ACL object for given user id
  //
  DbProxy.getUserPersonalAcl = function(userId) {
    var acl = {};
    acl[userId] = {
      "read": true,
      "write": true
    };
    return acl;
  };

  //
  // Checks if content type is valid
  // Only JSON supported
  //
  DbProxy.isContentTypeValid = function() {
    return (DbProxy.isRequestGet() && request.mimeType() == undefined) || (request.mimeType() == DbProxy.CONTENT_TYPE_JSON);
  };

  //
  // Checks if path requires session token:
  // if path is not present in DbProxy.ALLOW_NO_SESSION_TOKEN_PATHS
  //
  DbProxy.isSessionTokenRequired = function() {
    return !DbProxy.ALLOW_NO_SESSION_TOKEN_PATHS.contains(DbProxy.getPathValue());
  };

  //
  // Checks if session token is valid
  //
  DbProxy.isSessionTokenValid = function() {
    if (!DbProxy.isSessionTokenProvided()) {
      return false;
    }
    return DbProxy.loadUser();
  };

  //
  // Checks if session token provided in request
  //
  DbProxy.isSessionTokenProvided = function() {
    return DbProxy.getSessionTokenValue() !== false;
  };

  //
  // Loads user, returns true if loaded successfuly, false otherwise
  //
  DbProxy.loadUser = function() {
    if (DbProxy.userId !== false) {
      return true;
    }

    var rqOptions = {
      headers: {},
      parameters: {
        "limit": "1"
      }
    };
    rqOptions.headers[DbProxy.HEADERS.databaseId] = DbProxy.DATABASE_ID;
    rqOptions.headers[DbProxy.HEADERS.sessionToken] = DbProxy.getSessionTokenValue();

    // Try to retrieve one user to check token
    var XHRResponse = XHR.send("GET", DbProxy.DATABASE_URL + DbProxy.USERS_PATH, rqOptions);

    if (!DbProxy.isResponseCodeSuccessful(XHRResponse.status) || XHRResponse.body.length == 0) {
      return false;
    }

    DbProxy.userId = XHRResponse.body[0]._id;
    return true;
  };

  //
  // Returns session token value
  //
  DbProxy.getSessionTokenValue = function() {
    if (DbProxy.sessionToken === false) {
      DbProxy.populateSessionToken();
    }
    return DbProxy.sessionToken;
  };

  //
  // Populates session token from URL key or request body
  //
  DbProxy.populateSessionToken = function() {
    DbProxy.sessionToken = DbProxy.getRequestParamValue(DbProxy.URL_KEYS.sessionToken);
  };

  //
  // Returns request param value - from URL or from request body
  //
  DbProxy.getRequestParamValue = function(paramName) {
    if (!DbProxy.isRequestParamEmpty(paramName)) {
      return request.get(paramName);
    } else if (!DbProxy.isRequestGet() && request.mimeType().toLowerCase() == DbProxy.CONTENT_TYPE_JSON && request.body() != undefined) {
      var body;
      try {
        body = JSON.parse(request.body());
      } catch (e) {
        body = {};
      }
      if (!DbProxy.isRequestGet() && paramName in body) {
        return body[paramName];
      }
    }
    return false;
  };

  //
  // Generates authorization error
  //
  DbProxy.errorAuthorize = function() {
    response.error(DbProxy.ERR_MSG_AUTHORIZE, 401);
  };

  //
  // Adds session token to request options
  //
  DbProxy.addSessionTokenToRequestOptions = function(rqOptions) {
    rqOptions.headers[DbProxy.HEADERS.sessionToken] = DbProxy.getSessionTokenValue();
  };

  //
  // Replaces ACL with personal
  //
  DbProxy.replaceAclWithPersonal = function(rqOptions) {
    rqOptions["body"] = rqOptions["body"] || {};
    rqOptions.body["acl"] = DbProxy.getUserPersonalAcl(DbProxy.getUserId());
    return rqOptions;
  };

  //
  // Returns user id associated with session token
  //
  DbProxy.getUserId = function() {
    DbProxy.loadUser();
    return DbProxy.userId;
  };

  //
  // Removes ACL from request options
  //
  DbProxy.removeAclFromRequestOptions = function(rqOptions) {
    if ("body" in rqOptions && "acl" in rqOptions.body) {
      delete rqOptions.body.acl;
    }
    return rqOptions;
  };

  //
  // Returns forward request method
  //
  DbProxy.getForwardRequestMethod = function() {
    if (DbProxy.forwardRequestMethod !== false) {
      return DbProxy.forwardRequestMethod;
    }
    var method = DbProxy.getRequestParamValue(DbProxy.URL_KEYS.method);
    DbProxy.forwardRequestMethod = (method.length > 0) ? method : request.method;
    return DbProxy.forwardRequestMethod;
  };

  //
  // Make sure an array has "indexOf" function
  //
  if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(searchElement, fromIndex) {
      for (var i = fromIndex || 0, length = this.length; i < length; i++) {
        if (this[i] == searchElement) {
          return i;
        }
      }
      return -1;
    };
  }

  //
  // Make sure an array has "contains" function
  //
  if (!Array.prototype.contains) {
    Array.prototype.contains = function(searchElement) {
      return this.indexOf(searchElement) != -1;
    };
  }

  DbProxy.forwardRequest();

})(DbProxy);