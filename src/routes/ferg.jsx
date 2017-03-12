'use strict';

import React from 'react';
import { Router, Route, IndexRoute, browserHistory } from 'react-router';
import FergContainer from 'containers/ferg-container';
import { makeFetchParams, fetchRoutesData } from 'libs/fetch-data';
import Ferg365 from './ferg-365';
import FergBlog from './ferg-blog';
import FergBlogPage from './ferg-blog-page';
import FergGallery from './ferg-gallery';
import FergGalleryPhoto from './ferg-gallery-photo';
import FergLanding from './ferg-landing';

/* global NODE_MODE */

function fetchData(nextState, replace, callback) {
  // we dont need fetchData on server side
  if (NODE_MODE === 'server') {
    callback();
    return;
  }

  const needs = fetchRoutesData(
    window.REDUX_STORE,
    nextState.routes,
    makeFetchParams(nextState.location.query, nextState.params)
  );

  if (!needs.length) {
    callback();
    return;
  }

  Promise.all(needs)
  .then(() => {
    if (window.scrollTo) window.scrollTo(0, 0);
    callback();
  })
  .catch(() => {
    callback();
  });
}

const routes = [
  <IndexRoute component={FergLanding} key="index" onEnter={fetchData} />,
  <Route path="gallery" component={FergGallery} key="gallery" onEnter={fetchData} />,
  <Route path="gallery/:photo_id" component={FergGalleryPhoto} key="gallery_photo" onEnter={fetchData} />,
  <Route path="events" component={FergBlog} key="events" onEnter={fetchData} />,
  <Route path="events/:page_id" component={FergBlogPage} key="events_page" onEnter={fetchData} />,
  <Route path="blog" component={FergBlog} key="blog" onEnter={fetchData} />,
  <Route path="blog/:page_id" component={FergBlogPage} key="blog_page" onEnter={fetchData} />,
  <Route path="365" component={Ferg365} key="365" onEnter={fetchData} />,
];

export default (
  <Router history={browserHistory}>
    <Route path="/" component={FergContainer}>
      {routes}
      <Route path="ru/">{routes}</Route>
      <Route path="en/">{routes}</Route>
      <Route path="*" component={FergLanding} />
    </Route>
  </Router>
);