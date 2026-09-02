import pytest

from apps.accounts.models import User, UserRole


@pytest.mark.django_db
def test_email_is_the_login_identifier():
    user = User.objects.create_user(email="student@example.com", password="safe-test-password")

    assert user.username is None
    assert user.email == "student@example.com"
    assert user.role == UserRole.APPLICANT
    assert user.check_password("safe-test-password")
