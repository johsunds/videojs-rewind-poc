


class VdtHandler {

    // Default segment size in bytes
    static DEFAULT_SEGMENT_SIZE = 1 * (2 ** 20);

    // The next segment will be buffered when we are `BUFFER_NEXT_SEGMENT_THRESHOLD` seconds
    // real time (i.e. accounting for playbackRate) away from playing it.
    static BUFFER_NEXT_SEGMENT_THRESHOLD = 5;

    constructor(source, tech) {
        this.source = source;
        this.tech = tech;
        this.mediaSource = new MediaSource();
        this.mediaSource.addEventListener('sourceopen', this.sourceOpen.bind(this));
        this.mediaSource.addEventListener('sourceclose', () => {
            console.log("SOURCECLOSE");
        });
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
        this.segmentList = [...new Array(nSegments)].map((_, i) => {
            return {
                byteStart: i * segmentSize,
                byteEnd: Math.min((i + 1) * segmentSize, sourceSize) - 1,
                requested: false,
            }
        })
    }

    async sourceOpen() {
        this.sourceBuffer = this.mediaSource.addSourceBuffer(this.source.type);
        this.sourceBuffer.mode = "sequence";
        this.sourceSize = await this.getSourceSize();
        this.initSegmentsList(this.sourceSize);
        this.bufferIfNeeded();
        this.tech.on("timeupdate", this.bufferIfNeeded.bind(this));
        this.tech.on('seeking', this.seek.bind(this));
        this.sourceBuffer.addEventListener("updateend", () => {
            console.log("UPDATE END")
            // this.sourceBuffer.timestampOffset = 5;
        });
    }

    currentSegmentIndex() {
        if (!this.segmentDuration()) return 0;
        return Math.min(Math.trunc(this.tech.currentTime() / this.segmentDuration()), this.segmentList.length);
    }

    segmentDuration() {
        const duration = this.tech.duration();
        return duration ? (duration / this.segmentList.length) : undefined;
    }

    getSegmentTimeRange(segment) {
        if (!this.tech.duration()) return undefined;
        const start = (segment.byteStart / this.sourceSize) * this.tech.duration();
        const end = (segment.byteEnd / this.sourceSize) * this.tech.duration();
        return {
            start,
            end,
        }
    }

    nextSegmentIndex() {
        const currentSegmentIndex = this.currentSegmentIndex();
        const nextSegmentIndex = currentSegmentIndex + (this.tech.playbackRate() > 0 ? 1 : -1);
        if (nextSegmentIndex < 0 || nextSegmentIndex >= this.segmentList.length) {
            return undefined;
        }
        return nextSegmentIndex;
    }

    bufferIfNeeded() {
        const currentSegmentIndex = this.currentSegmentIndex();
        const currentSegment = this.segmentList[currentSegmentIndex];

        if (!currentSegment.requested) {
            return this.buffer(currentSegment);
        }

        const playbackRate = this.tech.playbackRate();
        const currentTime = this.tech.currentTime();
        const nextSegmentIndex = this.nextSegmentIndex();

        if (nextSegmentIndex === undefined) return;

        const nextSegment = this.segmentList[nextSegmentIndex];
        const nextSegmentTimeRange = this.getSegmentTimeRange(nextSegment);
        const nextSegmentBegin = playbackRate > 0 ? nextSegmentTimeRange.start : nextSegmentTimeRange.end;
        const timeUntilNextSegment = (nextSegmentBegin - currentTime) / playbackRate;

        if (!nextSegment.requested && timeUntilNextSegment < VdtHandler.BUFFER_NEXT_SEGMENT_THRESHOLD) {
            this.buffer(nextSegment);
        }
    }

    buffer(segment) {
        segment.requested = true;
        const segmentTimeRange = this.getSegmentTimeRange(segment);
        console.log("BUFFER", { segment, buffer: this.sourceBuffer, segmentTimeRange });
        const xhr = new XMLHttpRequest;
        xhr.open('get', this.source.src);
        xhr.responseType = 'arraybuffer';
        console.log("HEADER", 'bytes=' + segment.byteStart + '-' + segment.byteEnd);
        xhr.setRequestHeader('Range', 'bytes=' + segment.byteStart + '-' + segment.byteEnd);
        xhr.onload = () => {
          console.log("APPENDING");
          if (segmentTimeRange) {
            this.sourceBuffer.timestampOffset = segmentTimeRange.start;
            console.log({timestampOffset: this.sourceBuffer.timestampOffset})
          }
          this.sourceBuffer.appendBuffer(xhr.response);
        };
        xhr.send();
    }

    seek() {
        if (this.mediaSource.readyState === 'open') {
          console.log("ABORT");
          this.sourceBuffer.abort();
          this.bufferIfNeeded();
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