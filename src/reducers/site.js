'use strict';

import thunk from 'redux-thunk';
import { applyMiddleware, combineReducers, createStore } from 'redux';
import user_ip from './user_ip';
import session from './session';
import lang from './lang';
import location from './location';

/* global NODE_ENV */

export default function () {
  const root_reducer = combineReducers({
    user_ip,
    session,
    lang,
    location,
  });

  let state = {};

  if (NODE_ENV === 'dev') {
    if (typeof window !== 'undefined' && window.__REDUX_DEVTOOLS_EXTENSION__) {
      state = window.__REDUX_DEVTOOLS_EXTENSION__();
    }
  }

  return createStore(root_reducer, state, applyMiddleware(thunk));
}
