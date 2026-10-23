// Both the browser and Node import this file. Change the demo room in one place.
export const ROOM_ID = 'learning-room'
export const MAX_PARTICIPANTS = 2

export const EVENTS = Object.freeze({
  JOIN: 'room:join',
  LEAVE: 'room:leave',
  STATE: 'room:state',
  PEER_LEFT: 'room:peer-left',
  DESCRIPTION: 'rtc:description',
  CANDIDATE: 'rtc:candidate',
  END_CALL: 'call:end',
  CALL_ENDED: 'call:ended',
  ERROR: 'demo:error'
})
