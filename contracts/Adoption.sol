pragma solidity ^0.5.0;

contract Adoption {
    uint constant initialPetCount = 16;
    address public owner;
    address[16] public adopters;   // 初始宠物的领养者列表

    struct Pet {
        string name;
        uint age;
        string location;
        string breed;
        address adopter;
        uint likes;
    }
    Pet[] public newPets;          // 用户注册的新宠物列表

    uint public newPetsCount;
    mapping(uint => uint) public likes; // 宠物 ID 到点赞数的映射

    uint public constant returnFee = 0.001 ether; // 归还宠物需要支付的固定费用

    // 用户领养历史记录：用户地址 -> 宠物 ID 列表
    mapping(address => uint[]) public adoptionHistory;

    constructor() public {
        owner = msg.sender;
    }

    // 领养宠物（支持初始宠物和新注册宠物）
    function adopt(uint petId) public returns (uint) {
        require(petId >= 0, "Invalid petId");
        if (petId < initialPetCount) {
            require(adopters[petId] == address(0), "Pet already adopted");
            adopters[petId] = msg.sender;
        } else {
            uint index = petId - initialPetCount;
            require(index < newPetsCount, "Invalid petId");
            require(newPets[index].adopter == address(0), "Pet already adopted");
            newPets[index].adopter = msg.sender;
        }
        // 记录领养历史
        adoptionHistory[msg.sender].push(petId);
        return petId;
    }

    // 获取所有初始宠物的领养者
    function getAdopters() public view returns (address[16] memory) {
        return adopters;
    }

    // 注册新宠物（付费 0.0001 ETH）
    function registerPet(
        string memory name,
        uint age,
        string memory location,
        string memory breed
    )
        public
        payable
    {
        require(msg.value == 0.0001 ether, "Registration requires 0.0001 Ether");
        Pet memory pet = Pet(name, age, location, breed, address(0), 0);
        newPets.push(pet);
        newPetsCount++;
    }

    // 获取新注册宠物的数量
    function getNewPetsCount() public view returns (uint) {
        return newPetsCount;
    }

    // 获取第 index 个新宠物的信息
    function getNewPet(uint index)
        public
        view
        returns (
            string memory,
            uint,
            string memory,
            string memory,
            address
        )
    {
        require(index < newPetsCount, "Invalid index");
        Pet memory pet = newPets[index];
        return (pet.name, pet.age, pet.location, pet.breed, pet.adopter);
    }

    // 点赞功能
    function likePet(uint petId) public {
        likes[petId]++;
    }

    function getLikes(uint petId) public view returns (uint) {
        return likes[petId];
    }

    // 捐款
    function donate() public payable {
        require(msg.value > 0, "Donate non-zero");
    }

    // 归还宠物（归还后该宠物重新可领养，并从历史中移除）
    function returnPet(uint petId) public payable {
        require(msg.value >= returnFee, "Insufficient return fee");
        if (petId < initialPetCount) {
            require(adopters[petId] == msg.sender, "You are not the owner");
            adopters[petId] = address(0);
        } else {
            uint index = petId - initialPetCount;
            require(index < newPetsCount, "Invalid petId");
            require(newPets[index].adopter == msg.sender, "You are not the owner");
            newPets[index].adopter = address(0);
        }
        // 从领养历史中删除这条记录
        uint[] storage hist = adoptionHistory[msg.sender];
        for (uint i = 0; i < hist.length; i++) {
            if (hist[i] == petId) {
                // 用最后一项覆盖当前项，然后缩短数组
                hist[i] = hist[hist.length - 1];
                hist.length--;
                break;
            }
        }
    }

    // 查询某用户所有领养历史（已排除已归还的记录）
    function getAdoptionHistory(address user) public view returns (uint[] memory) {
        return adoptionHistory[user];
    }

    // 查询合约余额（仅调试/owner 使用）
    function getBalance() public view returns (uint) {
        return address(this).balance;
    }

    // Owner 提现
    function withdraw(uint amount) public {
        require(msg.sender == owner, "Only owner can withdraw");
        require(amount <= address(this).balance, "Insufficient balance");
        address payable receiver = address(uint160(owner));
        receiver.transfer(amount);
    }
	
    // 查询领养历史条数
    function getAdoptionHistoryCount(address user) public view returns (uint) {
        return adoptionHistory[user].length;
    }

    // 查询领养历史的某一项
    function getAdoptionHistoryAt(address user, uint idx) public view returns (uint) {
        require(idx < adoptionHistory[user].length, "index out of range");
        return adoptionHistory[user][idx];
    }
}
