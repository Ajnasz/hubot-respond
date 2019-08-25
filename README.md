# hubot-respond

Hubot script to respond to any message with something you defined.

## Installation


1. install this npm package to your hubot repo `npm i --save hubot-respond`
2. add "hubot-respond" to your external-scripts.json

## Commands

`hubot respond to A TEXT with VALUE` - Creates a new respond

`hubot here respond to A TEXT with VALUE` - Creates a new respond but only for the current room

`hubot delete respond to A TEXT` - Deletes a respond

`hubot from here delete respond to A TEXT` - Deletes a respond

`hubot list responds` - Lists all responds

### Example:

> you : hubot respond to hey team with @jane @jasmine @jack @joe

> hubot : Respond added

> you : hey team

> hubot : @jane @jasmine @jack @joe

#### Dynamic response

You can create a response where the sender's name or the room name is included, to do that use the `{sender}` or `{room}` special entries in the reponse.

In the following example assume that the room name is _general_

> you : hubot respond to Hi with Welcome @{sender} in the {room} room

> hubot : Respond added

> john : Hi

> Welcome @john in the general room
