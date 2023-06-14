


class VdtHandler {

    static DEFAULT_SEGMENT_SIZE = 1 * (2 ** 20);

    constructor(source, tech) {
        console.log({ source, tech });
        this.source = source;
        this.tech = tech;
        this.mediaSource = new MediaSource();
        this.mediaSource.addEventListener('sourceopen', this.sourceOpen.bind(this));
        this.tech.src(URL.createObjectURL(this.mediaSource));
    }

    getSourceSize() {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest;
            xhr.open('head', this.source.src);
            xhr.onload = function () {
                resolve(Number(xhr.getResponseHeader('content-length')));
            };
            xhr.send();
        });
    }

    initSegmentsList(sourceSize) {
        const segmentSize = Math.min(VdtHandler.DEFAULT_SEGMENT_SIZE, sourceSize);
        const nSegments = Math.ceil(sourceSize / segmentSize);
        console.log({nSegments, segmentSize, sourceSize, test: VdtHandler.DEFAULT_SEGMENT_SIZE})
        this.segmentList = [...new Array(nSegments)].map((_, i) => {
            return {
                byteStart: i * segmentSize,
                byteEnd: Math.min((i + 1) * segmentSize, sourceSize),
                requested: false,
            }
        })
    }

    async sourceOpen() {
        console.log("SOURCEOPEN");
        this.sourceBuffer = this.mediaSource.addSourceBuffer(this.source.type);
        this.sourceBuffer.mode = "segments";
        this.sourceSize = await this.getSourceSize();
        this.initSegmentsList(this.sourceSize);
        this.bufferIfNeeded();
        this.tech.on("timeupdate", this.bufferIfNeeded.bind(this));
        this.tech.el().addEventListener("canplay", () => {
            console.log({duration: this.tech.duration() })
        });
        //   video.addEventListener('seeking', seek);
    }

    currentSegmentIndex() {
        if (!this.segmentDuration) return 0;
        return Math.min(Math.trunc(this.tech.currentTime() / this.segmentDuration), this.segmentList.length);
    }

    async bufferIfNeeded() {
        const currentSegmentIndex = this.currentSegmentIndex();
        const currentSegment = this.segmentList[currentSegmentIndex];
        console.log("BUFFER IF NEEDED")
        if (currentSegmentIndex === 0 && !currentSegment.requested) {
            this.buffer(0);
        }
    }

    async buffer(segmentIndex) {
        const segment = this.segmentList[segmentIndex];
        console.log("BUFFER", segment);
        segment.requested = true;
        var xhr = new XMLHttpRequest;
        xhr.open('get', this.source.src);
        xhr.responseType = 'arraybuffer';
        xhr.setRequestHeader('Range', 'bytes=' + segment.byteStart + '-' + segment.byteEnd);
        xhr.onload = () => {
          console.log("fetched segment");
          console.log(segment);
          this.sourceBuffer.appendBuffer(xhr.response);
        };
        xhr.send();

    }

    seek() {
        if (mediaSource.readyState === 'open') {
          this.sourceBuffer.abort();
        }
    }

}

const VdtSourceHandler = {
    name: 'vdt',
    canHandleSource(srcObj, options = {}) {
      return VdtSourceHandler.canPlayType(srcObj.type);
    },
    handleSource(source, tech, options = {}) {
    //   tech.setSrc(source.src);
      tech.vdt = new VdtHandler(source, tech);
      return tech.vdt;
    },
    canPlayType(type, options) {
      const canPlay = !!('MediaSource' in window && MediaSource.isTypeSupported(type));
      return canPlay ? 'probably' : '';
    },
  };

export default VdtSourceHandler;