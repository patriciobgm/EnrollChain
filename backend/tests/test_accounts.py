import pytest

from apps.accounts.models import User, UserRole


@pytest.mark.django_db
def test_email_is_the_login_identifier():
    user = User.objects.create_user(email="student@example.com", password="safe-test-password")

    assert user.username is None
    assert user.email == "student@example.com"
    assert user.role == UserRole.APPLICANT
    assert user.check_password("safe-test-password")


@pytest.mark.django_db
def test_jwt_session_login_refresh_logout_and_revocation():
    from rest_framework.test import APIClient

    client = APIClient()
    User.objects.create_user(email="session@example.com", password="safe-test-password")
    response = client.post(
        "/api/v1/auth/token/",
        {
            "email": "session@example.com",
            "password": "safe-test-password",
        },
    )
    assert response.status_code == 200
    tokens = response.data
    client.credentials(HTTP_AUTHORIZATION="Bearer " + tokens["access"])
    assert client.get("/api/v1/accounts/me/").data["email"] == "session@example.com"
    renewed = client.post("/api/v1/auth/token/refresh/", {"refresh": tokens["refresh"]})
    assert renewed.status_code == 200
    assert (
        client.post("/api/v1/auth/token/refresh/", {"refresh": tokens["refresh"]}).status_code
        == 401
    )
    assert (
        client.post("/api/v1/auth/logout/", {"refresh": renewed.data["refresh"]}).status_code == 204
    )
    assert (
        client.post("/api/v1/auth/token/refresh/", {"refresh": renewed.data["refresh"]}).status_code
        == 401
    )


@pytest.mark.django_db
def test_logout_rejects_invalid_or_another_users_refresh_token():
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    owner = User.objects.create_user(email="owner@example.com")
    other = User.objects.create_user(email="other@example.com")
    token = str(RefreshToken.for_user(other))
    client = APIClient()
    client.force_authenticate(owner)
    assert client.post("/api/v1/auth/logout/", {"refresh": "invalid"}).status_code == 400
    assert client.post("/api/v1/auth/logout/", {"refresh": token}).status_code == 400
    assert client.post("/api/v1/auth/token/refresh/", {"refresh": token}).status_code == 200
