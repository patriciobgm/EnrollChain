from rest_framework import serializers

from .models import User


class CurrentUserSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "is_superuser",
            "mfa_enabled",
            "permissions",
        )
        read_only_fields = fields

    def get_permissions(self, user) -> list[str]:
        return sorted(user.get_all_permissions())


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(write_only=True)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    code = serializers.CharField(required=False, allow_blank=True, write_only=True, max_length=128)


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()


class SecurityActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(
        choices=["enroll", "confirm", "disable", "change_password", "revoke_sessions"]
    )
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    code = serializers.CharField(required=False, allow_blank=True, write_only=True, max_length=128)
    new_password = serializers.CharField(required=False, write_only=True, trim_whitespace=False)


class SecurityResultSerializer(serializers.Serializer):
    enabled = serializers.BooleanField(required=False)
    recovery_codes_remaining = serializers.IntegerField(required=False)
    secret = serializers.CharField(required=False)
    provisioning_uri = serializers.CharField(required=False)
    recovery_codes = serializers.ListField(child=serializers.CharField(), required=False)
    detail = serializers.CharField(required=False)
