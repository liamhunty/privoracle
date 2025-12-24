// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint64, euint128, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title PrivOracle
/// @notice Encrypted price prediction game for ETH and BTC with daily price updates.
contract PrivOracle is ZamaEthereumConfig {
    enum Asset {
        ETH,
        BTC
    }

    struct Prediction {
        euint64 price;
        euint8 direction;
        uint256 stake;
        bool confirmed;
        bool exists;
    }

    address private _owner;

    mapping(uint8 => mapping(uint256 => uint256)) private _dailyPrice;
    mapping(uint8 => mapping(uint256 => bool)) private _priceRecorded;
    mapping(uint8 => uint256) private _latestDay;
    mapping(address => mapping(uint8 => mapping(uint256 => Prediction))) private _predictions;
    mapping(address => euint128) private _points;
    mapping(address => bool) private _pointsInitialized;

    event OwnerUpdated(address indexed previousOwner, address indexed newOwner);
    event PriceRecorded(uint8 indexed asset, uint256 indexed day, uint256 price);
    event PredictionPlaced(address indexed user, uint8 indexed asset, uint256 indexed day, uint256 stake);
    event PredictionConfirmed(address indexed user, uint8 indexed asset, uint256 indexed day);

    modifier onlyOwner() {
        require(msg.sender == _owner, "Owner only");
        _;
    }

    constructor() {
        _owner = msg.sender;
        emit OwnerUpdated(address(0), msg.sender);
    }

    function owner() external view returns (address) {
        return _owner;
    }

    function currentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function recordDailyPrice(uint8 asset, uint256 price) external onlyOwner {
        require(asset <= uint8(Asset.BTC), "Invalid asset");
        require(price <= type(uint64).max, "Price too large");

        uint256 day = currentDay();
        require(!_priceRecorded[asset][day], "Price already recorded");

        _dailyPrice[asset][day] = price;
        _priceRecorded[asset][day] = true;
        _latestDay[asset] = day;

        emit PriceRecorded(asset, day, price);
    }

    function getPrice(uint8 asset, uint256 day) external view returns (uint256 price, bool recorded) {
        price = _dailyPrice[asset][day];
        recorded = _priceRecorded[asset][day];
    }

    function getLatestDay(uint8 asset) external view returns (uint256) {
        return _latestDay[asset];
    }

    function placePrediction(
        uint8 asset,
        externalEuint64 encryptedPrice,
        externalEuint8 encryptedDirection,
        bytes calldata inputProof
    ) external payable {
        require(asset <= uint8(Asset.BTC), "Invalid asset");
        require(msg.value > 0, "Stake required");
        require(msg.value <= type(uint128).max, "Stake too large");

        uint256 day = currentDay() + 1;
        Prediction storage prediction = _predictions[msg.sender][asset][day];
        require(!prediction.exists, "Prediction exists");

        prediction.price = FHE.fromExternal(encryptedPrice, inputProof);
        prediction.direction = FHE.fromExternal(encryptedDirection, inputProof);
        prediction.stake = msg.value;
        prediction.confirmed = false;
        prediction.exists = true;

        FHE.allowThis(prediction.price);
        FHE.allowThis(prediction.direction);
        FHE.allow(prediction.price, msg.sender);
        FHE.allow(prediction.direction, msg.sender);

        _initPoints(msg.sender);

        emit PredictionPlaced(msg.sender, asset, day, msg.value);
    }

    function confirmPrediction(uint8 asset, uint256 day) external {
        require(asset <= uint8(Asset.BTC), "Invalid asset");
        require(currentDay() >= day, "Too early");
        require(_priceRecorded[asset][day], "Price not recorded");

        Prediction storage prediction = _predictions[msg.sender][asset][day];
        require(prediction.exists, "Prediction missing");
        require(!prediction.confirmed, "Already confirmed");

        uint256 price = _dailyPrice[asset][day];
        euint64 actual = FHE.asEuint64(uint64(price));

        ebool isGreater = FHE.gt(actual, prediction.price);
        ebool isLess = FHE.lt(actual, prediction.price);
        ebool dirGreater = FHE.eq(prediction.direction, FHE.asEuint8(1));
        ebool dirLess = FHE.eq(prediction.direction, FHE.asEuint8(2));

        ebool isCorrect = FHE.or(FHE.and(dirGreater, isGreater), FHE.and(dirLess, isLess));
        euint128 reward = FHE.select(isCorrect, FHE.asEuint128(uint128(prediction.stake)), FHE.asEuint128(0));

        _points[msg.sender] = FHE.add(_points[msg.sender], reward);
        FHE.allowThis(_points[msg.sender]);
        FHE.allow(_points[msg.sender], msg.sender);

        prediction.confirmed = true;

        emit PredictionConfirmed(msg.sender, asset, day);
    }

    function getPrediction(
        address user,
        uint8 asset,
        uint256 day
    ) external view returns (euint64 price, euint8 direction, uint256 stake, bool confirmed, bool exists) {
        Prediction storage prediction = _predictions[user][asset][day];
        return (prediction.price, prediction.direction, prediction.stake, prediction.confirmed, prediction.exists);
    }

    function getPoints(address user) external view returns (euint128) {
        return _points[user];
    }

    function _initPoints(address user) internal {
        if (_pointsInitialized[user]) {
            return;
        }

        _points[user] = FHE.asEuint128(0);
        _pointsInitialized[user] = true;
        FHE.allowThis(_points[user]);
        FHE.allow(_points[user], user);
    }
}
