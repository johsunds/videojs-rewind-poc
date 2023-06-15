import videojs from 'video.js';

const logger = (source) => {
  if (videojs.log.debug) {
    return videojs.log.debug.bind(videojs, 'VHS:', `${source} >`);
  }

  // if (videojs.log.warn) {
  //   return videojs.log.warn.bind(videojs, 'VHS:', `${source} >`);
  // }

  return function() {};
};

export default logger;
