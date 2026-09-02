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
            "permissions",
        )
        read_only_fields = fields

    def get_permissions(self, user) -> list[str]:
        return sorted(user.get_all_permissions())


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(write_only=True)
