from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audit.services import record_audit_event

from .security import authenticate_credentials, tokens_for
from .serializers import (
    CurrentUserSerializer,
    LoginSerializer,
    LogoutSerializer,
    TokenPairSerializer,
)


class AuditedTokenObtainPairView(APIView):
    def get_authenticate_header(self, request):
        return 'Bearer realm="api"'

    authentication_classes = []
    permission_classes = []

    @extend_schema(request=LoginSerializer, responses=TokenPairSerializer)
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate_credentials(request, **serializer.validated_data)
        return Response(tokens_for(user))


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=LogoutSerializer, responses={204: None})
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
        except TokenError as exc:
            raise ValidationError({"refresh": "Invalid or expired refresh token."}) from exc
        if str(token["user_id"]) != str(request.user.pk):
            raise ValidationError({"refresh": "The refresh token does not belong to this session."})
        token.blacklist()
        record_audit_event(
            action="LOGOUT",
            entity="User",
            entity_id=str(request.user.pk),
            user=request.user,
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=CurrentUserSerializer)
    def get(self, request):
        return Response(CurrentUserSerializer(request.user).data)
