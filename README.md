appery-dbproxy
==============

Database proxy for appert.io platform

What is this
============

DbProxy is security layer between Appery application and database.
It doesn't allow unauthorized users to access database data, modify
ACL - every user has it's own sandbox in database thus he can't
create public objects accessible by anyone (with acl object `{"*": ...}`)
or modify existing object's acl.

It hides `X-Appery-Database-Id` so anyone will not be able to access
database objects without valid session token, and every object created
will be forced to be accessible only to creator.

How it works
============

DbProxy is Server Code script. It hooks singup service so every new user
is created with personal acl. Every new object created by user is updated
to have user's personal acl.  It has an interface similar to database
service with few differences (caused by Server Code limitations):
`X-Appery-Database-Id` should not be passed in request;
`X-Appery-Session-Token` should be passed as request variable (`GET` or
`POST` - doesn't matter);
`X-Appery-Request-Method` should be passed as request variable to use
method different from `GET` or `POST` - like `PUT` or `DELETE`.

Installation
============

To start using DbProxy you'll need to create new Server Code script with
and put into it contents from `dbproxy.js`. One setting should be changed:
`<DATABASE_ID>` should be replaced with your's real database id.

    var DbProxy = {
      //
      // Database Id
      //
      DATABASE_ID: "<DATABASE_ID>"
    };

Next step is to reconfigure your database services in application.
Open service editor, locate file called like `yourapp_settings` and
change value of `database_url` to URL of your new Server Code script.
Please replace `<SCRIPT_GUID_OR_ALIAS>` with script's actual GUID or
alias name:

    https://api.appery.io/rest/1/code/<SCRIPT_GUID_OR_ALIAS>/exec?X-Appery-Request-Path=

Now you'll need to update all services: remove `X-Appery-Database-Id` parameter
and uncheck `Header` checkbox for `X-Appery-Session-Token`.

For all "..._update" and "..._delete" services additional setup should be
performed: request method should be changed to `post` and one additional
parameter should be created - called `X-Appery-Request-Method` with default
value of original service method: `UPDATE` for "..._update" service and
`DELETE` for "..._delete" services. That's it! From this moment your
application will never send `X-Appery-Database-Id` header thus no one
will have direct access to your data, and no one will be able to
modify data not owned by him.

What it can't do
================

Since proxy is running as Server Code it's external interface is limited:
request type can be only `GET` or `POST` and `Content-Type` header is
also limited to text types, so proxy can't work with files collection.
To avoid this limitation there is simple solution - keep user's files
in separate database.
