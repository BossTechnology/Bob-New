// Singleton service instances — Backend Discovery §4 / Appendix A.
import { MetricAggregationService } from './MetricAggregationService'
import { SentimentAnalysisService } from './SentimentAnalysisService'
import { AlertEvaluationService } from './AlertEvaluationService'
import { AnomalyDetectionService } from './AnomalyDetectionService'
import { NotificationService } from './NotificationService'
import { BObeeService } from './BObeeService'
import { PatternRecognitionService } from './PatternRecognitionService'
import { RootCauseService } from './RootCauseService'

export const metricAggService = new MetricAggregationService()
export const sentimentService = new SentimentAnalysisService()
export const alertEvalService = new AlertEvaluationService()
export const anomalyService = new AnomalyDetectionService()
export const notificationService = new NotificationService()
export const bobeeService = new BObeeService()
export const patternService = new PatternRecognitionService()
export const rootCauseService = new RootCauseService()
