"""
Tests for EmailService (Issue #21).

Acceptance criteria:
- Sends weekly report HTML as email body
- Attaches resume PDFs (up to 10 attachments)
- Works with Resend and SendGrid
- If total attachment size exceeds 10MB: links to resumes instead of attaching
- Email sending logged with timestamp in weekly_reports table
- Failed email send: logs error, does not crash the weekly cycle
- Tests use mocked email provider so no real emails are sent in CI
- Provider SDKs are imported lazily (mirroring src/utils/llm_client.py), so
  the module imports and the SendGrid path works even when the `resend`
  package is not installed
- At least 3 test cases: normal send, empty attachments, provider failure handling
"""

import os
import sys
import types
import pytest
from unittest.mock import patch, MagicMock

from src.utils.email_service import EmailService

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_provider_modules():
    """
    Install fake `resend` / `sendgrid` packages into sys.modules so the lazy
    imports inside EmailService resolve to mocks without any SDK installed.
    """
    fake_resend = types.ModuleType("resend")
    fake_resend.Emails = MagicMock()
    fake_resend.api_key = None

    fake_sendgrid = types.ModuleType("sendgrid")
    fake_sendgrid.SendGridAPIClient = MagicMock()
    fake_helpers = types.ModuleType("sendgrid.helpers")
    fake_mail = types.ModuleType("sendgrid.helpers.mail")
    for name in (
        "Mail",
        "Attachment",
        "FileContent",
        "FileName",
        "FileType",
        "Disposition",
    ):
        setattr(fake_mail, name, MagicMock())
    fake_helpers.mail = fake_mail
    fake_sendgrid.helpers = fake_helpers

    with patch.dict(
        sys.modules,
        {
            "resend": fake_resend,
            "sendgrid": fake_sendgrid,
            "sendgrid.helpers": fake_helpers,
            "sendgrid.helpers.mail": fake_mail,
        },
    ):
        yield {
            "resend": fake_resend,
            "sendgrid": fake_sendgrid,
            "mail": fake_mail,
        }


@pytest.fixture
def mock_db_session():
    mock = MagicMock()
    # Ensure it returns a mock report when queried
    mock_report = MagicMock()
    mock_report.sent_at = None
    mock.query.return_value.filter.return_value.order_by.return_value.first.return_value = (
        mock_report
    )
    return mock, mock_report


@pytest.fixture
def temp_resumes(tmp_path):
    """Create some dummy 'PDF' files."""
    paths = []
    for i in range(3):
        path = tmp_path / f"resume_{i}.pdf"
        path.write_text(f"Dummy PDF content {i}")
        paths.append(str(path))
    return paths


@pytest.fixture
def large_resume(tmp_path):
    """Create a dummy large file > 10MB."""
    path = tmp_path / "large_resume.pdf"
    # Create 11MB file
    with open(path, "wb") as f:
        f.seek(11 * 1024 * 1024 - 1)
        f.write(b"0")
    return [str(path)]


# ===========================================================================
# Test Cases
# ===========================================================================


class TestEmailService:

    def test_module_imports_without_resend_installed(self):
        """
        The module must import successfully without the resend SDK present.
        Before the fix, `import resend` at module top raised
        ModuleNotFoundError and broke every test in this file.
        """
        import src.utils.email_service as es

        assert hasattr(es, "EmailService")
        # No module-level provider SDK attributes should be forced.
        assert not hasattr(es, "resend")
        assert not hasattr(es, "sendgrid")

    def test_normal_send_resend(
        self, fake_provider_modules, mock_db_session, temp_resumes
    ):
        """Test sending email normally via Resend with attachments."""
        fake_resend = fake_provider_modules["resend"]
        mock_db, mock_report = mock_db_session
        fake_resend.Emails.send.return_value = {"id": "12345"}

        with patch("src.utils.email_service.SessionLocal", return_value=mock_db):
            with patch.dict(
                os.environ,
                {"RESEND_API_KEY": "fake_key", "EMAIL_PROVIDER": "resend"},
            ):
                service = EmailService()
                result = service.send_weekly_report(
                    to_email="test@example.com",
                    subject="Weekly Report",
                    report_html="<h1>Hello</h1>",
                    resume_paths=temp_resumes,
                    user_id=1,
                )

                assert result is True
                fake_resend.Emails.send.assert_called_once()

                # Check attachments in params
                call_args = fake_resend.Emails.send.call_args[0][0]
                assert "attachments" in call_args
                assert len(call_args["attachments"]) == 3

                # Check database log
                mock_db.commit.assert_called_once()
                assert mock_report.sent_at is not None

    def test_normal_send_sendgrid(
        self, fake_provider_modules, mock_db_session, temp_resumes
    ):
        """Test sending email normally via SendGrid with attachments."""
        fake_sendgrid = fake_provider_modules["sendgrid"]
        mock_db, mock_report = mock_db_session

        mock_sg_instance = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 202
        mock_sg_instance.send.return_value = mock_response
        fake_sendgrid.SendGridAPIClient.return_value = mock_sg_instance

        with patch("src.utils.email_service.SessionLocal", return_value=mock_db):
            with patch.dict(
                os.environ,
                {"SENDGRID_API_KEY": "fake_key", "EMAIL_PROVIDER": "sendgrid"},
            ):
                service = EmailService()
                result = service.send_weekly_report(
                    to_email="test@example.com",
                    subject="Weekly Report",
                    report_html="<h1>Hello</h1>",
                    resume_paths=temp_resumes,
                    user_id=1,
                )

                assert result is True
                mock_sg_instance.send.assert_called_once()

                # Database log
                mock_db.commit.assert_called_once()

    def test_empty_attachments(self, fake_provider_modules):
        """Test sending email with no attachments."""
        fake_resend = fake_provider_modules["resend"]
        fake_resend.Emails.send.return_value = {"id": "12345"}

        with patch.dict(
            os.environ, {"RESEND_API_KEY": "fake_key", "EMAIL_PROVIDER": "resend"}
        ):
            service = EmailService()
            result = service.send_weekly_report(
                to_email="test@example.com",
                subject="Weekly Report",
                report_html="<h1>Hello</h1>",
                resume_paths=[],
                user_id=None,  # no db logging
            )

            assert result is True
            fake_resend.Emails.send.assert_called_once()
            call_args = fake_resend.Emails.send.call_args[0][0]
            assert "attachments" not in call_args

    def test_attachment_size_exceeds_limit(self, fake_provider_modules, large_resume):
        """Test that large attachments are dropped and a note is added."""
        fake_resend = fake_provider_modules["resend"]
        fake_resend.Emails.send.return_value = {"id": "12345"}

        with patch.dict(
            os.environ, {"RESEND_API_KEY": "fake_key", "EMAIL_PROVIDER": "resend"}
        ):
            service = EmailService()
            html = "<h1>Hello</h1>"
            result = service.send_weekly_report(
                to_email="test@example.com",
                subject="Weekly Report",
                report_html=html,
                resume_paths=large_resume,
                user_id=None,
            )

            assert result is True
            fake_resend.Emails.send.assert_called_once()
            call_args = fake_resend.Emails.send.call_args[0][0]

            # Should have no attachments because size exceeded 10MB
            assert "attachments" not in call_args

            # Note should be appended to HTML
            assert "exceeded 10MB limit" in call_args["html"]

    def test_provider_failure_handling(
        self, fake_provider_modules, mock_db_session, temp_resumes
    ):
        """Test that provider failure does not crash the app and returns False."""
        fake_resend = fake_provider_modules["resend"]
        mock_db, mock_report = mock_db_session
        fake_resend.Emails.send.side_effect = Exception("API Down")

        with patch("src.utils.email_service.SessionLocal", return_value=mock_db):
            with patch.dict(
                os.environ,
                {"RESEND_API_KEY": "fake_key", "EMAIL_PROVIDER": "resend"},
            ):
                service = EmailService()
                result = service.send_weekly_report(
                    to_email="test@example.com",
                    subject="Weekly Report",
                    report_html="<h1>Hello</h1>",
                    resume_paths=temp_resumes,
                    user_id=1,
                )

                assert result is False
                # Should not commit to DB since sending failed
                mock_db.commit.assert_not_called()

    def test_missing_api_key_handling(self, fake_provider_modules):
        """Test missing API key fails gracefully."""
        fake_resend = fake_provider_modules["resend"]

        # Intentionally missing API key
        with patch.dict(os.environ, {"EMAIL_PROVIDER": "resend", "RESEND_API_KEY": ""}):
            service = EmailService()
            result = service.send_weekly_report(
                to_email="test@example.com",
                subject="Weekly Report",
                report_html="<h1>Hello</h1>",
                resume_paths=[],
            )
            assert result is False
            fake_resend.Emails.send.assert_not_called()

    def test_missing_sendgrid_api_key_handling(self, fake_provider_modules):
        """Missing SendGrid API key fails gracefully without crashing."""
        fake_sendgrid = fake_provider_modules["sendgrid"]

        with patch.dict(
            os.environ, {"EMAIL_PROVIDER": "sendgrid", "SENDGRID_API_KEY": ""}
        ):
            service = EmailService()
            result = service.send_weekly_report(
                to_email="test@example.com",
                subject="Weekly Report",
                report_html="<h1>Hello</h1>",
                resume_paths=[],
            )
            assert result is False
            fake_sendgrid.SendGridAPIClient.assert_not_called()
