import logging
from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import strip_tags
from django.utils import timezone

logger = logging.getLogger(__name__)


def build_outcome_email_html(user, job, department_name, status_type):
    """
    Renders high-grade, government-branded responsive HTML email for applicant outcomes.

    A successful outcome is worded as the opportunity having been *granted*,
    not as the applicant having been "hired". Employment wording implied a
    contract of service that an industrial attachment placement is not, so the
    previous "you have been hired" phrasing was replaced throughout with
    "granted the opportunity".
    """
    full_name = f"{user.first_name} {user.last_name}".strip() or user.username
    is_successful = (status_type == "SUCCESSFUL")

    if is_successful:
        banner_title = "APPLICATION SUCCESSFUL — OPPORTUNITY GRANTED"
        banner_color = "#065f46"
        banner_bg = "#ecfdf5"
        banner_border = "#a7f3d0"
        headline = "Congratulations!"
        message_body = f"""
            <p style="margin-bottom: 16px; font-size: 15px; line-height: 1.7; color: #1e293b;">
                We are pleased to formally inform you that your application for the industrial attachment opportunity of
                <strong style="color: #0f172a;">{job.title}</strong> within the
                <strong style="color: #0f172a;">{department_name}</strong> was successful.
            </p>
            <p style="margin-bottom: 16px; font-size: 15px; line-height: 1.7; color: #1e293b;">
                You have successfully been granted the industrial attachment opportunity. Your academic credentials, field of
                study, and verified qualification dossier demonstrated exemplary potential aligned with the developmental
                mandate of the State Department for Petroleum.
            </p>
            <div style="background-color: #f8fafc; border-left: 4px solid #059669; padding: 16px 20px; border-radius: 8px; margin: 24px 0;">
                <h4 style="margin: 0 0 8px 0; color: #065f46; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Next Operational Steps</h4>
                <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.6;">
                    <li>Our Human Resource Directorate is preparing your official deployment records.</li>
                    <li>You will be notified once your departmental onboarding schedule is finalized.</li>
                    <li>Please ensure all your mandatory identification and insurance documents remain accessible in the portal.</li>
                </ul>
            </div>
        """
    else:
        banner_title = "APPLICATION OUTCOME NOTIFICATION"
        banner_color = "#475569"
        banner_bg = "#f1f5f9"
        banner_border = "#cbd5e1"
        headline = "Attachment Application Outcome"
        message_body = f"""
            <p style="margin-bottom: 16px; font-size: 15px; line-height: 1.7; color: #1e293b;">
                Thank you for your application for the 
                <strong style="color: #0f172a;">{job.title}</strong> industrial attachment opportunity with the 
                <strong style="color: #0f172a;">{department_name}</strong> at the State Department for Petroleum.
            </p>
            <p style="margin-bottom: 16px; font-size: 15px; line-height: 1.7; color: #1e293b;">
                We received a very large volume of highly qualified applications for this intake cycle. 
                After comprehensive review and evaluation against departmental intake quotas, we regret to inform you that 
                we are unable to offer you a placement for this particular opening.
            </p>
            <p style="margin-bottom: 16px; font-size: 15px; line-height: 1.7; color: #1e293b;">
                This decision reflects only the intense competition and limited capacity for this intake, not a lack of merit in your academic profile. 
                We sincerely appreciate your interest in serving with the State Department and encourage you to apply for upcoming attachment vacancies in future cycles.
            </p>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{banner_title}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
            <tr>
                <td align="center" style="padding: 30px 15px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0;">
                        <!-- Government Header -->
                        <tr>
                            <td align="center" style="background: linear-gradient(135deg, #064e3b 0%, #065f46 60%, #047857 100%); padding: 32px 24px; color: #ffffff;">
                                <div style="text-transform: uppercase; font-size: 12px; letter-spacing: 2px; font-weight: 800; color: #a7f3d0; margin-bottom: 6px;">Republic of Kenya</div>
                                <div style="font-size: 19px; font-weight: 900; letter-spacing: 0.5px; margin-bottom: 4px;">Ministry of Energy and Petroleum</div>
                                <div style="font-size: 16px; font-weight: 700; color: #fde68a;">State Department for Petroleum</div>
                            </td>
                        </tr>

                        <!-- Status Badge -->
                        <tr>
                            <td style="padding: 24px 32px 0 32px;">
                                <div style="background-color: {banner_bg}; border: 1px solid {banner_border}; color: {banner_color}; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 8px 14px; border-radius: 8px; display: inline-block;">
                                    {banner_title}
                                </div>
                                <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin: 16px 0 0 0;">{headline}</h2>
                            </td>
                        </tr>

                        <!-- Body Content -->
                        <tr>
                            <td style="padding: 20px 32px 32px 32px;">
                                <p style="font-size: 15px; font-weight: 600; color: #334155; margin-bottom: 16px;">Dear {full_name},</p>
                                {message_body}
                                <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b; line-height: 1.6;">
                                    <strong style="color: #334155;">Directorate of Human Resource Management & Development</strong><br>
                                    State Department for Petroleum &bull; Nyayo House, Kenyatta Avenue, Nairobi<br>
                                    Website: <a href="https://sdp-industrial-attachment-system.vercel.app" style="color: #059669; text-decoration: none;">Industrial Attachment Portal</a>
                                </div>
                            </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #0f172a; padding: 20px 32px; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.5;">
                                This is an automated official notification from the State Department for Petroleum Industrial Attachment Management System. Please do not reply directly to this email.
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    return html


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_applicant_outcome_email_task(self, application_id, status_type):
    """
    Background Celery task to dispatch applicant outcome notification email.
    Safely catches and logs errors to prevent application workflow disruptions.
    """
    from .models import Application
    from accounts.audit import log_audit_event

    try:
        application = Application.objects.select_related("user", "job", "job__department").get(pk=application_id)
    except Application.DoesNotExist:
        logger.warning(f"Application #{application_id} does not exist for outcome email notification.")
        return False

    user = application.user
    job = application.job
    dept_name = job.department.name if job.department else "State Department for Petroleum"

    if not user.email:
        logger.warning(f"Applicant user {user.username} has no email address configured.")
        return False

    # Only the two deciding statuses produce an email. PENDING and REVIEWED are
    # workflow markers, so sending anything for them would tell an applicant an
    # outcome that has not been decided.
    if status_type == "SUCCESSFUL":
        subject = f"Application Successful: Opportunity Granted — {job.title}"
    elif status_type == "REJECTED":
        subject = f"Application Outcome — {job.title}"
    else:
        return False

    html_content = build_outcome_email_html(user, job, dept_name, status_type)
    text_content = strip_tags(html_content)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "State Department for Petroleum <noreply@petroleum.go.ke>")

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=from_email,
            to=[user.email],
        )
        msg.attach_alternative(html_content, "text/html")
        msg.send(fail_silently=False)

        # Update notification timestamps on application
        application.outcome_notified_at = timezone.now()
        application.outcome_notified_status = status_type
        application.save(update_fields=["outcome_notified_at", "outcome_notified_status"])

        logger.info(f"Successfully sent {status_type} outcome email to {user.email} for application #{application_id}.")
        return True

    except Exception as exc:
        logger.error(f"Failed to send outcome email to {user.email} for application #{application_id}: {exc}", exc_info=True)
        # Log to AuditLog for operational visibility
        try:
            from accounts.models import AuditLog
            AuditLog.objects.create(
                actor=None,
                action="EMAIL_DELIVERY_FAILED",
                target_description=f"Failed to deliver {status_type} email to {user.email} for application #{application_id}: {str(exc)[:200]}",
                metadata={"application_id": application_id, "recipient_email": user.email, "status": status_type, "error": str(exc)},
            )
        except Exception as audit_err:
            logger.error(f"Failed to log audit event for email failure: {audit_err}")

        # In production Celery workers, retry if transient network error
        if not getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
            try:
                self.retry(exc=exc)
            except Exception:
                pass

        return False
