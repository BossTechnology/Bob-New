// Backend Discovery §4.5 / §8.3–§8.5 — routes alerts to Resend, Twilio, Slack.
import { getServiceClient } from '@/lib/supabase'
import type { BobAlert, NotificationRule } from '@/lib/types'

const SEV_COLOR: Record<string, string> = { critical: '#d22', warning: '#e90', info: '#28a' }

function buildAlertEmailHTML(alert: BobAlert): string {
  return `<div style="font-family:DM Sans,Arial,sans-serif">
    <h2 style="color:${SEV_COLOR[alert.sev]}">[BOb ${alert.sev.toUpperCase()}] ${alert.metric_name}</h2>
    <p>Value <b>${alert.value}</b> breached threshold <b>${alert.threshold}</b> (${alert.breach_type}).</p>
    <p>Channel: ${alert.channel_id} · ${new Date(alert.occurred_at).toLocaleString()}</p>
  </div>`
}

function buildSlackAlertBlocks(alert: BobAlert) {
  return [
    { type: 'header', text: { type: 'plain_text', text: `BOb ${alert.sev.toUpperCase()}: ${alert.metric_name}` } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: `*Value:*\n${alert.value}` },
      { type: 'mrkdwn', text: `*Threshold:*\n${alert.threshold}` },
      { type: 'mrkdwn', text: `*Channel:*\n${alert.channel_id}` },
      { type: 'mrkdwn', text: `*Severity:*\n${alert.sev}` },
    ] },
  ]
}

function twilioBase64(): string {
  return Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')
}

export class NotificationService {
  async route(alert: BobAlert, rule: NotificationRule): Promise<void> {
    if (alert.sev === 'info') return // info = log only
    const jobs: Promise<void>[] = []
    if (rule.notify_email && rule.email_recipients?.length) jobs.push(this.sendEmail(alert, rule.email_recipients))
    if (rule.notify_sms && rule.sms_recipients?.length) jobs.push(this.sendSMS(alert, rule.sms_recipients))
    if (rule.notify_slack && rule.slack_webhook) jobs.push(this.sendSlack(alert, rule.slack_webhook))
    if (rule.notify_call && rule.call_recipients?.length && alert.sev === 'critical') jobs.push(this.makeCall(alert, rule.call_recipients))
    await Promise.allSettled(jobs)
  }

  async sendEmail(alert: BobAlert, recipients: string[]): Promise<void> {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'alerts@bosstechnology.com',
        to: recipients,
        subject: `[BOb ${alert.sev.toUpperCase()}] ${alert.metric_name} at ${alert.value}%`,
        html: buildAlertEmailHTML(alert),
      }),
    })
    await this.logDelivery(alert.id, alert.org_id, 'email', recipients, 'sent')
  }

  async sendSMS(alert: BobAlert, recipients: string[]): Promise<void> {
    const body = `[BOb] ${alert.sev.toUpperCase()}: ${alert.metric_name} ${alert.value}% (threshold ${alert.threshold}%)`
    for (const to of recipients) {
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${twilioBase64()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: to, From: process.env.TWILIO_PHONE_NUMBER || '', Body: body.slice(0, 160) }),
      })
      await this.logDelivery(alert.id, alert.org_id, 'sms', [to], 'sent')
    }
  }

  async sendSlack(alert: BobAlert, webhook: string): Promise<void> {
    await fetch(webhook, { method: 'POST', body: JSON.stringify({ blocks: buildSlackAlertBlocks(alert) }) })
    await this.logDelivery(alert.id, alert.org_id, 'slack', ['webhook'], 'sent')
  }

  async makeCall(alert: BobAlert, recipients: string[]): Promise<void> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    for (const to of recipients) {
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${twilioBase64()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          To: to, From: process.env.TWILIO_PHONE_NUMBER || '',
          Url: `${appUrl}/api/twilio/twiml?alert_id=${alert.id}`,
        }),
      })
      await this.logDelivery(alert.id, alert.org_id, 'call', [to], 'sent')
    }
  }

  private async logDelivery(
    alertId: string, orgId: string, channel: string, recipients: string[], status: string,
  ): Promise<void> {
    const sb = getServiceClient()
    await sb.from('notification_log').insert(
      recipients.map((recipient) => ({ alert_id: alertId, org_id: orgId, channel, recipient, status })),
    )
  }
}
