import {
  IssueDetector,
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';

class FramesEncodedSentIssueDetector implements IssueDetector {
  #lastProcessedStats: { [connectionId: string]: WebRTCStatsParsed } = {};

  #missedFramesTreshold = 0.15;

  detect(data: WebRTCStatsParsed): IssueDetectorResult {
    const issues = this.processData(data);
    this.#lastProcessedStats[data.connection.id] = data;
    return issues;
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const streamsWithEncodedFrames = data.video.outbound.filter((stats) => stats.framesEncoded > 0);
    const issues: IssueDetectorResult = [];
    const previousOutboundRTPVideoStreamsStats = this.#lastProcessedStats[data.connection.id]?.video.outbound;

    if (!previousOutboundRTPVideoStreamsStats) {
      return issues;
    }

    streamsWithEncodedFrames.forEach((streamStats) => {
      const previousStreamStats = previousOutboundRTPVideoStreamsStats.find((item) => item.ssrc === streamStats.ssrc);

      if (!previousStreamStats) {
        return;
      }

      if (streamStats.framesEncoded === previousStreamStats.framesEncoded) {
        // stream is paused
        return;
      }

      const deltaFramesEncoded = streamStats.framesEncoded - previousStreamStats.framesEncoded;
      const deltaFramesSent = streamStats.framesSent - previousStreamStats.framesSent;

      if (deltaFramesEncoded === 0) {
        // stream is paused
        return;
      }

      if (deltaFramesEncoded === deltaFramesSent) {
        // stream is ok
        return;
      }

      const missedFrames = deltaFramesSent / deltaFramesEncoded;
      if (missedFrames >= this.#missedFramesTreshold) {
        issues.push({
          type: IssueType.Network,
          reason: IssueReason.OutboundNetworkThroughput,
          ssrc: streamStats.ssrc,
          debug: `missedFrames: ${Math.round(missedFrames * 100)}%`,
        });
      }
    });

    return issues;
  }
}

export default FramesEncodedSentIssueDetector;
